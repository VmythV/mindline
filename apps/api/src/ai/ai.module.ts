import { Module } from '@nestjs/common';
import { ChangesModule } from '../changes/changes.module';
import { AiController } from './ai.controller';
import { AiService } from './ai.service';
import { ProvidersController } from './providers.controller';
import { ProvidersService } from './providers.service';

@Module({
  imports: [ChangesModule],
  controllers: [AiController, ProvidersController],
  providers: [AiService, ProvidersService],
  exports: [ProvidersService],
})
export class AiModule {}
