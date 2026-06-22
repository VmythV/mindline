import { Module } from '@nestjs/common';
import { ChangesModule } from '../changes/changes.module';
import { CollabWriterService } from './collab-writer.service';
import { MapsController } from './maps.controller';

/** 地图写通道模块：复用 ChangesModule 导出的 ChangesService 做鉴权与落库。 */
@Module({
  imports: [ChangesModule],
  providers: [CollabWriterService],
  controllers: [MapsController],
  exports: [CollabWriterService],
})
export class MapsModule {}
