import { IsBoolean, IsOptional, IsString, MinLength } from 'class-validator';

export class UpdateCommentDto {
  @IsString()
  @IsOptional()
  @MinLength(1)
  body?: string;

  @IsBoolean()
  @IsOptional()
  resolved?: boolean;
}
