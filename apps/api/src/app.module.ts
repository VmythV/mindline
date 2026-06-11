import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_FILTER, APP_GUARD } from '@nestjs/core';
import { DbModule } from './db/db.module';
import { InfraModule } from './infra/infra.module';
import { AuthModule } from './auth/auth.module';
import { ProjectsModule } from './projects/projects.module';
import { NodeTypesModule } from './node-types/node-types.module';
import { ChangesModule } from './changes/changes.module';
import { AiModule } from './ai/ai.module';
import { MilestonesModule } from './milestones/milestones.module';
import { CommentsModule } from './comments/comments.module';
import { TransferModule } from './transfer/transfer.module';
import { JwtAuthGuard } from './common/guards/jwt-auth.guard';
import { AllExceptionsFilter } from './common/filters/all-exceptions.filter';
import { HealthController } from './health.controller';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    DbModule,
    InfraModule,
    AuthModule,
    ProjectsModule,
    NodeTypesModule,
    ChangesModule,
    AiModule,
    MilestonesModule,
    CommentsModule,
    TransferModule,
  ],
  controllers: [HealthController],
  providers: [
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_FILTER, useClass: AllExceptionsFilter },
  ],
})
export class AppModule {}
