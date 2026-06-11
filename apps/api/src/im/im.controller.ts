import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Post,
  UseGuards,
} from '@nestjs/common';
import { CurrentUser, type AuthUser } from '../common/decorators/current-user.decorator';
import { MinRole } from '../common/decorators/min-role.decorator';
import { ProjectRoleGuard } from '../common/guards/project-role.guard';
import { ImService } from './im.service';
import { CreateChannelDto } from './dto/create-channel.dto';
import { PublishDto } from './dto/publish.dto';

@Controller()
export class ImController {
  constructor(private readonly svc: ImService) {}

  /** GET /projects/:id/im-channels — 列出项目渠道（Viewer+）。 */
  @UseGuards(ProjectRoleGuard)
  @MinRole('viewer')
  @Get('projects/:id/im-channels')
  listChannels(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    return this.svc.listChannels(id, user.tenantId);
  }

  /** POST /projects/:id/im-channels — 创建渠道（Admin+）。 */
  @UseGuards(ProjectRoleGuard)
  @MinRole('admin')
  @Post('projects/:id/im-channels')
  createChannel(
    @Param('id') id: string,
    @CurrentUser() user: AuthUser,
    @Body() dto: CreateChannelDto,
  ) {
    return this.svc.createChannel(id, user, dto);
  }

  /** DELETE /im-channels/:id — 删除渠道（Admin+，service 内校验）。 */
  @Delete('im-channels/:id')
  @HttpCode(204)
  async deleteChannel(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    await this.svc.deleteChannel(id, user);
  }

  /** POST /im/publish — 发布消息（Editor+，service 内校验）。 */
  @Post('im/publish')
  publish(@CurrentUser() user: AuthUser, @Body() dto: PublishDto) {
    return this.svc.publish(user, dto);
  }
}
