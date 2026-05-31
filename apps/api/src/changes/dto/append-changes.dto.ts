import { Type } from 'class-transformer';
import {
  Allow,
  ArrayNotEmpty,
  IsArray,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  ValidateNested,
} from 'class-validator';
import { CHANGE_OPS, type ChangeOp } from '@mindline/shared';

class ChangeEventInput {
  @IsString()
  nodeId!: string;

  @IsIn(CHANGE_OPS as readonly string[])
  op!: ChangeOp;

  @IsOptional()
  @IsString()
  field?: string;

  @Allow()
  before?: unknown;

  @Allow()
  after?: unknown;

  @IsOptional()
  @IsString()
  batchId?: string;

  @IsInt()
  ts!: number;
}

export class AppendChangesDto {
  @IsArray()
  @ArrayNotEmpty()
  @ValidateNested({ each: true })
  @Type(() => ChangeEventInput)
  events!: ChangeEventInput[];
}
