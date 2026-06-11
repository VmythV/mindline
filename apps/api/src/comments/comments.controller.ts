import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post } from '@nestjs/common';
import { CurrentUser, type AuthUser } from '../common/decorators/current-user.decorator';
import { CommentsService } from './comments.service';
import { CreateCommentDto } from './dto/create-comment.dto';
import { UpdateCommentDto } from './dto/update-comment.dto';

@Controller()
export class CommentsController {
  constructor(private readonly comments: CommentsService) {}

  @Get('maps/:mapId/nodes/:nodeId/comments')
  list(
    @Param('mapId') mapId: string,
    @Param('nodeId') nodeId: string,
    @CurrentUser() user: AuthUser,
  ) {
    return this.comments.list(mapId, nodeId, user.tenantId);
  }

  @Post('maps/:mapId/nodes/:nodeId/comments')
  create(
    @Param('mapId') mapId: string,
    @Param('nodeId') nodeId: string,
    @CurrentUser() user: AuthUser,
    @Body() dto: CreateCommentDto,
  ) {
    return this.comments.create(mapId, nodeId, user, dto);
  }

  @Patch('comments/:id')
  update(
    @Param('id') id: string,
    @CurrentUser() user: AuthUser,
    @Body() dto: UpdateCommentDto,
  ) {
    return this.comments.update(id, user, dto);
  }

  @HttpCode(204)
  @Delete('comments/:id')
  remove(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    return this.comments.remove(id, user);
  }
}
