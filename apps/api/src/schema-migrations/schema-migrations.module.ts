import { Module } from '@nestjs/common';
import { ChangesModule } from '../changes/changes.module';
import { SchemaMigrationsService } from './schema-migrations.service';
import { SchemaMigrationsController } from './schema-migrations.controller';

@Module({
  imports: [
    // 复用 ChangesService.resolveMapAccess() 及 snapshot() 能力（约定④路由无 projectId 时的鉴权）
    ChangesModule,
  ],
  providers: [SchemaMigrationsService],
  controllers: [SchemaMigrationsController],
  exports: [SchemaMigrationsService],
})
export class SchemaMigrationsModule {}
