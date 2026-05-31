import { Body, Controller, Get, Param, Post, Put, UseGuards } from '@nestjs/common';
import { CurrentUser, type AuthUser } from '../common/decorators/current-user.decorator';
import { MinRole } from '../common/decorators/min-role.decorator';
import { ProjectRoleGuard } from '../common/guards/project-role.guard';
import { NodeTypesService } from './node-types.service';
import { CreateNodeTypeDto } from './dto/create-node-type.dto';
import { UpdateNodeTypeDto } from './dto/update-node-type.dto';

@Controller()
export class NodeTypesController {
  constructor(private readonly svc: NodeTypesService) {}

  @UseGuards(ProjectRoleGuard)
  @MinRole('viewer')
  @Get('projects/:id/node-types')
  list(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    return this.svc.list(id, user.tenantId);
  }

  @UseGuards(ProjectRoleGuard)
  @MinRole('admin')
  @Post('projects/:id/node-types')
  create(@Param('id') id: string, @CurrentUser() user: AuthUser, @Body() dto: CreateNodeTypeDto) {
    return this.svc.create(id, user.tenantId, dto);
  }

  // 鉴权在 service 内反查（路由无 projectId）：项目 admin+ 才可改
  @Put('node-types/:id')
  update(@Param('id') id: string, @CurrentUser() user: AuthUser, @Body() dto: UpdateNodeTypeDto) {
    return this.svc.update(id, user, dto);
  }
}
