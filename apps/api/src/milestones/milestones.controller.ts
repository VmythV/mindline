import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { CurrentUser, type AuthUser } from '../common/decorators/current-user.decorator';
import { MinRole } from '../common/decorators/min-role.decorator';
import { ProjectRoleGuard } from '../common/guards/project-role.guard';
import { MilestonesService } from './milestones.service';
import { AiSuggestDto, CreateMilestoneDto, UpdateMilestoneDto } from './milestones.dto';

@Controller()
export class MilestonesController {
  constructor(private readonly svc: MilestonesService) {}

  @UseGuards(ProjectRoleGuard)
  @MinRole('viewer')
  @Get('projects/:id/milestones')
  list(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    return this.svc.list(id, user);
  }

  @UseGuards(ProjectRoleGuard)
  @MinRole('editor')
  @Post('projects/:id/milestones')
  create(@Param('id') id: string, @CurrentUser() user: AuthUser, @Body() dto: CreateMilestoneDto) {
    return this.svc.create(id, user, dto);
  }

  @UseGuards(ProjectRoleGuard)
  @MinRole('editor')
  @Post('projects/:id/milestones/ai-suggest')
  suggest(@Param('id') id: string, @CurrentUser() user: AuthUser, @Body() dto: AiSuggestDto) {
    return this.svc.aiSuggest(id, user, dto);
  }

  // 鉴权在 service 内反查（路由无 projectId）
  @Patch('milestones/:id')
  update(@Param('id') id: string, @CurrentUser() user: AuthUser, @Body() dto: UpdateMilestoneDto) {
    return this.svc.update(id, user, dto);
  }

  @Delete('milestones/:id')
  @HttpCode(204)
  async remove(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    await this.svc.remove(id, user);
  }
}
