import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { IsArray, IsString } from 'class-validator';
import { CurrentUser, type AuthUser } from '../common/decorators/current-user.decorator';
import { ChangesService } from './changes.service';
import { AppendChangesDto } from './dto/append-changes.dto';

class ResolveNodeRefsDto {
  @IsArray() @IsString({ each: true }) ids!: string[];
}

@Controller()
export class ChangesController {
  constructor(private readonly svc: ChangesService) {}

  @Post('maps/:mapId/changes')
  append(
    @Param('mapId') mapId: string,
    @CurrentUser() user: AuthUser,
    @Body() dto: AppendChangesDto,
  ) {
    return this.svc.append(mapId, user, dto);
  }

  @Get('maps/:mapId/changes')
  list(
    @Param('mapId') mapId: string,
    @CurrentUser() user: AuthUser,
    @Query('limit') limit?: string,
    @Query('node') node?: string,
    @Query('actor') actor?: string,
    @Query('op') op?: string,
    @Query('branch') branch?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('cursor') cursor?: string,
  ) {
    return this.svc.list(mapId, user, {
      limit: limit ? Number(limit) : undefined,
      nodeId: node,
      actor,
      op,
      branch,
      from: from ? Number(from) : undefined,
      to: to ? Number(to) : undefined,
      cursor: cursor ?? null,
    });
  }

  @Get('maps/:mapId/snapshot')
  snapshot(@Param('mapId') mapId: string, @CurrentUser() user: AuthUser) {
    return this.svc.snapshot(mapId, user);
  }

  @Post('nodes/resolve')
  resolveNodeRefs(@Body() dto: ResolveNodeRefsDto, @CurrentUser() user: AuthUser) {
    return this.svc.resolveNodeRefs(dto.ids, user);
  }

  @Get('nodes/:nodeId/history')
  history(
    @Param('nodeId') nodeId: string,
    @CurrentUser() user: AuthUser,
    @Query('limit') limit?: string,
    @Query('cursor') cursor?: string,
  ) {
    return this.svc.nodeHistory(nodeId, user, {
      limit: limit ? Number(limit) : undefined,
      cursor: cursor ?? null,
    });
  }
}
