import { Body, Controller, Post, Req, Res } from '@nestjs/common';
import { CurrentUser, type AuthUser } from '../common/decorators/current-user.decorator';
import { AiService } from './ai.service';
import { DecomposeDto } from './dto/decompose.dto';
import { SummarizeDto } from './dto/summarize.dto';
import { ConverseDto } from './dto/converse.dto';
import { CompleteDto } from './dto/complete.dto';
import { RewriteDto } from './dto/rewrite.dto';

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

type Emitter = (event: string, data: unknown) => void;

async function runSse(
  req: SseReq,
  res: SseRes,
  timeoutMs: number,
  fn: (emit: Emitter, signal: AbortSignal) => Promise<void>,
) {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream; charset=utf-8',
    'Cache-Control': 'no-cache, no-transform',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no',
  });
  const emit: Emitter = (event, data) =>
    res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
  const ac = new AbortController();
  const onClose = () => ac.abort();
  req.on('close', onClose);
  const timer = setTimeout(() => ac.abort(), timeoutMs);
  try {
    await fn(emit, ac.signal);
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
    const { projectId } = await this.svc.assertEditor(dto.mapId, user);
    await runSse(req, res, 60_000, (emit, signal) =>
      this.svc.decompose(dto, user, projectId, emit, signal),
    );
  }

  /** AI 摘要（SSE）：meta → delta* → done；与 decompose 同样的鉴权/中断/超时模式。 */
  @Post('ai/summarize')
  async summarize(
    @Body() dto: SummarizeDto,
    @CurrentUser() user: AuthUser,
    @Req() req: SseReq,
    @Res() res: SseRes,
  ) {
    const { projectId } = await this.svc.assertEditor(dto.mapId, user);
    await runSse(req, res, 60_000, (emit, signal) =>
      this.svc.summarize(dto, user, projectId, emit, signal),
    );
  }

  /** AI 多轮对话（SSE）：delta* → done；基于节点上下文的连续对话。 */
  @Post('ai/converse')
  async converse(
    @Body() dto: ConverseDto,
    @CurrentUser() user: AuthUser,
    @Req() req: SseReq,
    @Res() res: SseRes,
  ) {
    const { projectId } = await this.svc.assertEditor(dto.mapId, user);
    await runSse(req, res, 120_000, (emit, signal) =>
      this.svc.converse(dto, user, projectId, emit, signal),
    );
  }

  /** AI 补全查重（SSE）：delta* → done；根据同级节点标题检测重复并补全。 */
  @Post('ai/complete')
  async complete(
    @Body() dto: CompleteDto,
    @CurrentUser() user: AuthUser,
    @Req() req: SseReq,
    @Res() res: SseRes,
  ) {
    const { projectId } = await this.svc.assertEditor(dto.mapId, user);
    await runSse(req, res, 30_000, (emit, signal) =>
      this.svc.complete(dto, user, projectId, emit, signal),
    );
  }

  /** AI 改写节点标题（SSE）：delta* → done；按用户 prompt 对当前节点标题改写。 */
  @Post('ai/rewrite')
  async rewrite(
    @Body() dto: RewriteDto,
    @CurrentUser() user: AuthUser,
    @Req() req: SseReq,
    @Res() res: SseRes,
  ) {
    const { projectId } = await this.svc.assertEditor(dto.mapId, user);
    await runSse(req, res, 30_000, (emit, signal) =>
      this.svc.rewrite(dto, user, projectId, emit, signal),
    );
  }
}
