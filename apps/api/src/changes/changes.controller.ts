import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { CurrentUser, type AuthUser } from '../common/decorators/current-user.decorator';
import { ChangesService } from './changes.service';
import { AppendChangesDto } from './dto/append-changes.dto';

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
  ) {
    return this.svc.list(mapId, user, limit ? Number(limit) : undefined);
  }
}
