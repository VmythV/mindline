import { Body, Controller, Get, Headers, Param, Post } from '@nestjs/common';
import { CurrentUser, type AuthUser } from '../common/decorators/current-user.decorator';
import { TransferService } from './transfer.service';
import { TransferPreviewDto } from './dto/transfer-preview.dto';

@Controller()
export class TransferController {
  constructor(private readonly transfer: TransferService) {}

  @Post('transfer/preview')
  preview(@CurrentUser() user: AuthUser, @Body() dto: TransferPreviewDto) {
    return this.transfer.preview(user, dto);
  }

  @Post('transfer/execute')
  execute(
    @CurrentUser() user: AuthUser,
    @Headers('authorization') authHeader: string,
    @Body() dto: TransferPreviewDto,
  ) {
    const token = (authHeader ?? '').replace(/^Bearer\s+/i, '');
    return this.transfer.execute(user, dto, token);
  }

  @Get('transfer/:jobId')
  getJob(@Param('jobId') jobId: string, @CurrentUser() user: AuthUser) {
    return this.transfer.getJob(jobId, user);
  }
}
