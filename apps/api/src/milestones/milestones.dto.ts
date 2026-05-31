import { Type } from 'class-transformer';
import { IsInt, IsOptional, IsString, MaxLength, ValidateNested } from 'class-validator';

class RangeDto {
  @IsOptional()
  @IsInt()
  start?: number;

  @IsOptional()
  @IsInt()
  end?: number;
}

export class CreateMilestoneDto {
  @IsString()
  @MaxLength(200)
  title!: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsString()
  nodeId?: string;

  @IsOptional()
  @ValidateNested()
  @Type(() => RangeDto)
  range?: RangeDto;
}

export class UpdateMilestoneDto {
  @IsOptional()
  @IsString()
  @MaxLength(200)
  title?: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsString()
  aiSummary?: string;

  @IsOptional()
  @ValidateNested()
  @Type(() => RangeDto)
  range?: RangeDto;
}

class SuggestRangeDto {
  @IsInt()
  from!: number;

  @IsInt()
  to!: number;
}

export class AiSuggestDto {
  @ValidateNested()
  @Type(() => SuggestRangeDto)
  range!: SuggestRangeDto;
}
