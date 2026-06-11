import { IsString, IsIn, IsOptional } from 'class-validator';

export class PublishDto {
  @IsString() channelId!: string;
  @IsIn(['node', 'milestone', 'summary']) type!: 'node' | 'milestone' | 'summary';
  @IsString() targetId!: string;
  @IsString() @IsOptional() content?: string; // 自定义内容，留空则自动生成
}
