import { Module } from '@nestjs/common';
import { ChangesModule } from '../changes/changes.module';
import { AiController } from './ai.controller';
import { AiService } from './ai.service';

@Module({
  imports: [ChangesModule],
  controllers: [AiController],
  providers: [AiService],
})
export class AiModule {}
