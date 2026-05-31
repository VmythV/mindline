import { Module } from '@nestjs/common';
import { NodeTypesService } from './node-types.service';
import { NodeTypesController } from './node-types.controller';
import { ProjectRoleGuard } from '../common/guards/project-role.guard';

@Module({
  providers: [NodeTypesService, ProjectRoleGuard],
  controllers: [NodeTypesController],
})
export class NodeTypesModule {}
