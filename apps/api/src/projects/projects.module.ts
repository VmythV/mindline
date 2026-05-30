import { Module } from '@nestjs/common';
import { ProjectsService } from './projects.service';
import { ProjectsController } from './projects.controller';
import { ProjectRoleGuard } from '../common/guards/project-role.guard';

@Module({
  providers: [ProjectsService, ProjectRoleGuard],
  controllers: [ProjectsController],
})
export class ProjectsModule {}
