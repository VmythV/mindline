import { IsIn, IsOptional, IsString, MaxLength } from 'class-validator';

export class SummarizeDto {
  @IsString()
  mapId!: string;

  @IsString()
  nodeId!: string;

  @IsOptional()
  @IsIn(['subtree', 'node'])
  scope?: 'subtree' | 'node';

  @IsOptional()
  @IsString()
  lang?: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  prompt?: string;
}
