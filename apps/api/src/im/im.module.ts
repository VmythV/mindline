import { Module } from '@nestjs/common';
import { ImService } from './im.service';
import { ImController } from './im.controller';
import { ChangesModule } from '../changes/changes.module';

@Module({
  imports: [ChangesModule],
  providers: [ImService],
  controllers: [ImController],
})
export class ImModule {}
