import { Module } from '@nestjs/common';
import { CommentsController } from './comments.controller';
import { CommentsService } from './comments.service';
import { ChangesModule } from '../changes/changes.module';

@Module({
  imports: [ChangesModule],
  controllers: [CommentsController],
  providers: [CommentsService],
})
export class CommentsModule {}
