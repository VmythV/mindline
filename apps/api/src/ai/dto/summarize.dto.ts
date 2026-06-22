import { IsIn, IsInt, IsOptional, IsString, MaxLength } from 'class-validator';

export class SummarizeDto {
  @IsString()
  mapId!: string;

  // subtree/node 需要 nodeId；range 用 from/to（nodeId 可省）
  @IsOptional()
  @IsString()
  nodeId?: string;

  @IsOptional()
  @IsIn(['subtree', 'node', 'range'])
  scope?: 'subtree' | 'node' | 'range';

  // scope=range 的时间区间（epoch ms）
  @IsOptional()
  @IsInt()
  from?: number;

  @IsOptional()
  @IsInt()
  to?: number;

  @IsOptional()
  @IsString()
  lang?: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  prompt?: string;
}
