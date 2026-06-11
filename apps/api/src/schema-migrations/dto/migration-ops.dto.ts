/**
 * 迁移算子 DTO —— M4 首发 5 个高频算子（Schema迁移工具详设 §3.1）。
 * 使用 discriminated union 通过 type 字段区分算子类型，由 class-validator 逐个校验。
 */
import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsIn,
  IsObject,
  IsOptional,
  IsString,
  ValidateIf,
  ValidateNested,
} from 'class-validator';

/** 支持的算子名列表（M4 首发 5 个） */
export const MIGRATION_OP_NAMES = [
  'renameField',
  'setDefault',
  'convertType',
  'mapEnum',
  'dropField',
] as const;
export type MigrationOpName = (typeof MIGRATION_OP_NAMES)[number];

/** convertType 转换失败策略 */
export const ON_ERROR_VALUES = ['skip', 'null', 'markIssue'] as const;
export type OnErrorValue = (typeof ON_ERROR_VALUES)[number];

/** convertType 目标类型 */
export const CONVERT_TARGET_TYPES = [
  'string',
  'number',
  'boolean',
  'date',
] as const;
export type ConvertTargetType = (typeof CONVERT_TARGET_TYPES)[number];

// ---------------------------------------------------------------------------
// 各算子 class（用于 ValidateNested 时 class-transformer 需要具体类）
// ---------------------------------------------------------------------------

export class RenameFieldOpDto {
  @IsIn(MIGRATION_OP_NAMES)
  op!: 'renameField';

  /** 原字段名 */
  @IsString()
  from!: string;

  /** 目标字段名 */
  @IsString()
  to!: string;
}

export class SetDefaultOpDto {
  @IsIn(MIGRATION_OP_NAMES)
  op!: 'setDefault';

  @IsString()
  field!: string;

  /** 要设置的值（any） */
  value!: unknown;

  /** 为 true 时仅在字段为空（null/undefined）时才设置 */
  @IsOptional()
  @IsBoolean()
  onlyIfEmpty?: boolean;
}

export class ConvertTypeOpDto {
  @IsIn(MIGRATION_OP_NAMES)
  op!: 'convertType';

  @IsString()
  field!: string;

  /** 目标类型 */
  @IsIn(CONVERT_TARGET_TYPES)
  to!: ConvertTargetType;

  /** 解析格式（如 'yyyy/MM/dd'，仅 date 时生效） */
  @IsOptional()
  @IsString()
  parse?: string;

  /** 格式化模板（仅 string 时生效） */
  @IsOptional()
  @IsString()
  format?: string;

  /** 转换失败策略 */
  @IsOptional()
  @IsIn(ON_ERROR_VALUES)
  onError?: OnErrorValue;
}

export class MapEnumOpDto {
  @IsIn(MIGRATION_OP_NAMES)
  op!: 'mapEnum';

  @IsString()
  field!: string;

  /** 枚举值映射表，如 { "doing": "in_progress" } */
  @IsObject()
  mapping!: Record<string, string>;

  /** 未命中时的回退值（省略则保留原值） */
  @IsOptional()
  @IsString()
  fallback?: string;
}

export class DropFieldOpDto {
  @IsIn(MIGRATION_OP_NAMES)
  op!: 'dropField';

  @IsString()
  field!: string;
}

// ---------------------------------------------------------------------------
// 联合类型 DTO（路由接受的单条算子，由 op 区分）
// 注意：class-validator 不原生支持 discriminated union；
// 这里提供一个包装 class 用于 ValidateNested，op 字段用 @IsIn 约束。
// ---------------------------------------------------------------------------

/**
 * 单条迁移算子。
 * 在 MigrationPreviewDto 中以 @ValidateNested({ each: true }) + @Type(() => MigrationOpDto) 使用。
 * 为保持简洁，各算子参数均标为可选，并由 service 层做细粒度验证；
 * @IsIn(MIGRATION_OP_NAMES) 保证 op 合法。
 */
export class MigrationOpDto {
  /** 算子名 */
  @IsIn(MIGRATION_OP_NAMES)
  op!: MigrationOpName;

  /** renameField: 原字段名 */
  @ValidateIf((o: MigrationOpDto) => o.op === 'renameField')
  @IsString()
  from?: string;

  /** renameField: 目标字段名 */
  @ValidateIf((o: MigrationOpDto) => o.op === 'renameField')
  @IsString()
  to?: string;

  /** setDefault/convertType/mapEnum/dropField: 目标字段名 */
  @ValidateIf((o: MigrationOpDto) =>
    (['setDefault', 'convertType', 'mapEnum', 'dropField'] as MigrationOpName[]).includes(o.op),
  )
  @IsString()
  field?: string;

  /** setDefault: 设置的值 */
  value?: unknown;

  /** setDefault: 只在字段为空时设置 */
  @IsOptional()
  @IsBoolean()
  onlyIfEmpty?: boolean;

  /** convertType: 目标类型 */
  @ValidateIf((o: MigrationOpDto) => o.op === 'convertType')
  @IsIn(CONVERT_TARGET_TYPES)
  convertTo?: ConvertTargetType;

  /** convertType: 解析格式（日期字符串格式，如 yyyy/MM/dd） */
  @IsOptional()
  @IsString()
  parse?: string;

  /** convertType: 格式化模板 */
  @IsOptional()
  @IsString()
  format?: string;

  /** convertType: 失败策略 */
  @IsOptional()
  @IsIn(ON_ERROR_VALUES)
  onError?: OnErrorValue;

  /** mapEnum: 枚举值映射表 */
  @ValidateIf((o: MigrationOpDto) => o.op === 'mapEnum')
  @IsObject()
  mapping?: Record<string, string>;

  /** mapEnum: 未命中时的回退值 */
  @IsOptional()
  @IsString()
  fallback?: string;
}
