import { Module } from '@nestjs/common';
import { AiModule } from '../ai/ai.module';
import { MilestonesController } from './milestones.controller';
import { MilestonesService } from './milestones.service';

@Module({
  imports: [AiModule], // 复用 ProvidersService（凭证路由 + 计量）
  controllers: [MilestonesController],
  providers: [MilestonesService],
})
export class MilestonesModule {}
