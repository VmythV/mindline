import { Module } from '@nestjs/common';
import { ChangesModule } from '../changes/changes.module';
import { MapsModule } from '../maps/maps.module';
import { TransferController } from './transfer.controller';
import { TransferService } from './transfer.service';

@Module({
  imports: [ChangesModule, MapsModule],
  controllers: [TransferController],
  providers: [TransferService],
})
export class TransferModule {}
