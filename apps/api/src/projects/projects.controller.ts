import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import type { Role } from '@mindline/shared';
import { CurrentUser, type AuthUser } from '../common/decorators/current-user.decorator';
import { ProjectRole } from '../common/decorators/project-role.decorator';
import { MinRole } from '../common/decorators/min-role.decorator';
import { ProjectRoleGuard } from '../common/guards/project-role.guard';
import { ProjectsService } from './projects.service';
import { CreateProjectDto } from './dto/create-project.dto';
import { UpdateProjectDto } from './dto/update-project.dto';
import { AddMemberDto } from './dto/add-member.dto';
import { UpdateMemberDto } from './dto/update-member.dto';

@Controller()
export class ProjectsController {
  constructor(private readonly projects: ProjectsService) {}

  @Get('projects')
  list(@CurrentUser() user: AuthUser, @Query('parentId') parentId?: string) {
    return this.projects.list(user, parentId);
  }

  @Post('projects')
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateProjectDto) {
    return this.projects.create(user, dto);
  }

  @UseGuards(ProjectRoleGuard)
  @Get('projects/:id')
  get(@Param('id') id: string, @CurrentUser() user: AuthUser, @ProjectRole() role: Role) {
    return this.projects.get(id, user.tenantId, role);
  }

  @UseGuards(ProjectRoleGuard)
  @MinRole('admin')
  @Patch('projects/:id')
  update(
    @Param('id') id: string,
    @CurrentUser() user: AuthUser,
    @Body() dto: UpdateProjectDto,
    @ProjectRole() role: Role,
  ) {
    return this.projects.update(id, dto, user.tenantId, role);
  }

  @UseGuards(ProjectRoleGuard)
  @MinRole('owner')
  @HttpCode(204)
  @Delete('projects/:id')
  remove(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    return this.projects.remove(id, user.tenantId);
  }

  @UseGuards(ProjectRoleGuard)
  @MinRole('viewer')
  @Get('projects/:id/members')
  listMembers(@Param('id') id: string) {
    return this.projects.listMembers(id);
  }

  @UseGuards(ProjectRoleGuard)
  @MinRole('admin')
  @Post('projects/:id/members')
  addMember(@Param('id') id: string, @CurrentUser() user: AuthUser, @Body() dto: AddMemberDto) {
    return this.projects.addMember(id, user.tenantId, dto);
  }

  @UseGuards(ProjectRoleGuard)
  @MinRole('admin')
  @Patch('projects/:id/members/:userId')
  updateMember(
    @Param('id') id: string,
    @Param('userId') userId: string,
    @Body() dto: UpdateMemberDto,
  ) {
    return this.projects.updateMember(id, userId, dto.role);
  }

  @UseGuards(ProjectRoleGuard)
  @MinRole('admin')
  @HttpCode(204)
  @Delete('projects/:id/members/:userId')
  removeMember(@Param('id') id: string, @Param('userId') userId: string) {
    return this.projects.removeMember(id, userId);
  }

  @UseGuards(ProjectRoleGuard)
  @MinRole('viewer')
  @Get('projects/:id/permissions')
  getPermissions(@ProjectRole() role: Role) {
    return this.projects.getPermissions(role);
  }
}
