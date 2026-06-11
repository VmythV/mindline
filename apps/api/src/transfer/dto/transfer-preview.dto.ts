import { IsIn, IsOptional, IsString } from 'class-validator';

export class TransferPreviewDto {
  @IsString() fromUserId!: string;
  @IsString() toUserId!: string;
  @IsIn(['project', 'workspace', 'tenant']) scope!: 'project' | 'workspace' | 'tenant';
  @IsString() @IsOptional() scopeId?: string;
}
