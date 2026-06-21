import { Body, Controller, Headers, Param, Post } from '@nestjs/common';
import { CurrentUser, type AuthUser } from '../common/decorators/current-user.decorator';
import { CollabWriterService } from './collab-writer.service';
import { ExecuteCommandsDto } from './dto/execute-commands.dto';

@Controller()
export class MapsController {
  constructor(private readonly writer: CollabWriterService) {}

  /**
   * 服务端写通道：在协同文档上执行命令层命令（建/改/移/删/应用提案），Editor+。
   * token 取自请求头，转交给 collab 连接（连接身份）；落库 actor 用 JWT 注入的 userId。
   */
  @Post('maps/:mapId/commands')
  execute(
    @Param('mapId') mapId: string,
    @CurrentUser() user: AuthUser,
    @Headers('authorization') authHeader: string,
    @Body() dto: ExecuteCommandsDto,
  ) {
    const token = (authHeader ?? '').replace(/^Bearer\s+/i, '');
    return this.writer.execute(mapId, user, token, dto.commands);
  }
}
