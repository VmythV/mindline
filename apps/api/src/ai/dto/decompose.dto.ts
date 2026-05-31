import { IsInt, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';

export class DecomposeDto {
  @IsString()
  mapId!: string;

  @IsString()
  nodeId!: string;

  @IsOptional()
  @IsString()
  targetType?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(3)
  depth?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(20)
  maxChildren?: number;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  prompt?: string;

  @IsOptional()
  @IsString()
  lang?: string;
}
