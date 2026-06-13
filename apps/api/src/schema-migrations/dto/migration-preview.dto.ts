import { Type } from 'class-transformer';
import { IsArray, IsInt, IsOptional, ValidateNested } from 'class-validator';
import { MigrationOpDto } from './migration-ops.dto';

export class MigrationPreviewDto {
  @IsInt()
  fromVersion!: number;

  @IsInt()
  toVersion!: number;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => MigrationOpDto)
  ops!: MigrationOpDto[];

  @IsOptional()
  filter?: { where?: string };

  @IsArray()
  @IsOptional()
  scopeProjectIds?: string[];
}
