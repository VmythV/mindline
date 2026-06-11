import { IsArray, IsOptional, IsString, MinLength } from 'class-validator';

export class CreateCommentDto {
  @IsString()
  @MinLength(1)
  body: string = '';

  @IsArray()
  @IsOptional()
  mentions?: string[];
}
