import { Body, Controller, Post, Req, Res } from '@nestjs/common';
import { CurrentUser, type AuthUser } from '../common/decorators/current-user.decorator';
import { AiService } from './ai.service';
import { DecomposeDto } from './dto/decompose.dto';

/** SSE 所需的最小 Express req/res 形态（避免依赖 @types/express）。 */
interface SseReq {
  on(event: 'close', cb: () => void): void;
  off(event: 'close', cb: () => void): void;
}
interface SseRes {
  writeHead(status: number, headers: Record<string, string>): void;
  write(chunk: string): void;
  end(): void;
}

@Controller()
export class AiController {
  constructor(private readonly svc: AiService) {}

  /**
   * AI 拆解（SSE）。鉴权在写流前完成（失败→全局过滤器返 JSON）；
   * 之后流式推送 meta → op* → done，异常转 error 事件。前端断开 → abort 上游。
   */
  @Post('ai/decompose')
  async decompose(
    @Body() dto: DecomposeDto,
    @CurrentUser() user: AuthUser,
    @Req() req: SseReq,
    @Res() res: SseRes,
  ) {
    const { projectId } = await this.svc.assertEditor(dto.mapId, user); // 抛 403/404 → JSON

    res.writeHead(200, {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    });

    const ac = new AbortController();
    const onClose = () => ac.abort();
    req.on('close', onClose);
    const timer = setTimeout(() => ac.abort(), 60_000);
    const emit = (event: string, data: unknown) =>
      res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);

    try {
      await this.svc.decompose(dto, user, projectId, emit, ac.signal);
    } catch (e) {
      const message = e instanceof Error ? e.message : '生成失败';
      emit('error', {
        code: ac.signal.aborted ? 'ABORTED' : 'INTERNAL',
        message: ac.signal.aborted ? '已取消' : message,
        retryable: !ac.signal.aborted,
      });
    } finally {
      clearTimeout(timer);
      req.off('close', onClose);
      res.end();
    }
  }
}
