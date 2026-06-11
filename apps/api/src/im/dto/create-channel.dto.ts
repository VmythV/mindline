import { IsString, IsIn } from 'class-validator';

export class CreateChannelDto {
  @IsString() name!: string;
  @IsIn(['wecom', 'dingtalk', 'feishu', 'slack', 'webhook']) type!: string;
  @IsString() webhookUrl!: string; // 明文，service 层加密存储
}
