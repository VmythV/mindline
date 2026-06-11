/**
 * 迁移算子实现 —— 纯函数，无副作用，无 IO。
 * Schema迁移工具详设 §3.1 定义的 5 个 M4 首发高频算子。
 *
 * 输入：节点的 data 字段（不含 STRUCT_KEYS，见下方常量）。
 * 输出：
 *   - patch: 需要应用到 Y.Map 的变更集（value=undefined 表示删除该 key），null 表示无变更。
 *   - issues: 告警信息列表（不中断整批执行）。
 */

import type { MigrationOpDto } from './dto/migration-ops.dto';

/**
 * Y.Doc nodes Map 中每个节点的结构键（不属于业务 data）。
 * 迁移算子不处理这些字段。
 */
export const STRUCT_KEYS = new Set([
  'id',
  'parentId',
  'order',
  'type',
  'title',
  'private',
  '_deprecatedFields',
]);

export interface ApplyOpsResult {
  /** 需要写入的字段变更集；key 存在且 value===undefined 表示删除该 key；null 表示无变更。 */
  patch: Record<string, unknown> | null;
  /** 告警列表，不中断整批 */
  issues: string[];
}

// ---------------------------------------------------------------------------
// 类型转换辅助
// ---------------------------------------------------------------------------

function isEmpty(v: unknown): boolean {
  return v === null || v === undefined || v === '';
}

/** 将值转换为 number，失败返回 null */
function toNumber(v: unknown): number | null {
  if (typeof v === 'number') return v;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

/** 将值转换为 boolean */
function toBoolean(v: unknown): boolean {
  if (typeof v === 'boolean') return v;
  if (typeof v === 'string') {
    if (v.toLowerCase() === 'true' || v === '1') return true;
    if (v.toLowerCase() === 'false' || v === '0') return false;
  }
  return Boolean(v);
}

/** 简单日期解析（支持 ISO 和 yyyy/MM/dd 格式） */
function parseDate(v: unknown, _format?: string): Date | null {
  if (v instanceof Date) return v;
  if (typeof v !== 'string' && typeof v !== 'number') return null;
  const d = new Date(v);
  return isNaN(d.getTime()) ? null : d;
}

// ---------------------------------------------------------------------------
// 单算子应用函数
// ---------------------------------------------------------------------------

function applyRenameField(
  data: Record<string, unknown>,
  from: string,
  to: string,
  patch: Record<string, unknown>,
  issues: string[],
): void {
  if (!(from in data)) {
    // 原字段不存在，记录 issue，跳过
    issues.push(`renameField: 字段 "${from}" 不存在，跳过`);
    return;
  }
  patch[to] = data[from];
  patch[from] = undefined; // 删除旧字段
}

function applySetDefault(
  data: Record<string, unknown>,
  field: string,
  value: unknown,
  onlyIfEmpty: boolean,
  patch: Record<string, unknown>,
  _issues: string[],
): void {
  const current = data[field];
  if (onlyIfEmpty && !isEmpty(current)) {
    // 字段有值，不覆盖
    return;
  }
  patch[field] = value;
}

function applyConvertType(
  data: Record<string, unknown>,
  field: string,
  targetType: string,
  parse: string | undefined,
  _format: string | undefined,
  onError: string,
  patch: Record<string, unknown>,
  issues: string[],
): void {
  if (!(field in data)) {
    // 字段不存在，跳过（非 issue）
    return;
  }
  const original = data[field];
  if (isEmpty(original)) {
    // 空值不转换
    return;
  }

  let converted: unknown;
  let failed = false;

  switch (targetType) {
    case 'string':
      converted = String(original);
      break;
    case 'number': {
      const n = toNumber(original);
      if (n === null) {
        failed = true;
      } else {
        converted = n;
      }
      break;
    }
    case 'boolean':
      converted = toBoolean(original);
      break;
    case 'date': {
      const d = parseDate(original, parse);
      if (d === null) {
        failed = true;
      } else {
        // 存储为 ISO 字符串
        converted = d.toISOString();
      }
      break;
    }
    default:
      failed = true;
      issues.push(`convertType: 未知目标类型 "${targetType}"，字段 "${field}" 跳过`);
      return;
  }

  if (failed) {
    switch (onError) {
      case 'skip':
        // 保持原值，不写 patch
        issues.push(`convertType: 字段 "${field}" 值 ${JSON.stringify(original)} 转换为 ${targetType} 失败，已跳过（skip）`);
        return;
      case 'null':
        patch[field] = null;
        issues.push(`convertType: 字段 "${field}" 值 ${JSON.stringify(original)} 转换为 ${targetType} 失败，已置 null`);
        return;
      case 'markIssue':
      default:
        issues.push(`convertType: 字段 "${field}" 值 ${JSON.stringify(original)} 转换为 ${targetType} 失败（markIssue）`);
        return;
    }
  }

  patch[field] = converted;
}

function applyMapEnum(
  data: Record<string, unknown>,
  field: string,
  mapping: Record<string, string>,
  fallback: string | undefined,
  patch: Record<string, unknown>,
  issues: string[],
): void {
  if (!(field in data)) {
    return;
  }
  const original = data[field];
  const key = String(original);
  if (key in mapping) {
    const mapped = mapping[key];
    if (mapped !== original) {
      patch[field] = mapped;
    }
  } else if (fallback !== undefined) {
    issues.push(`mapEnum: 字段 "${field}" 值 "${key}" 未命中映射，应用 fallback "${fallback}"`);
    if (fallback !== original) {
      patch[field] = fallback;
    }
  } else {
    // 无 fallback，保持原值，记 issue
    issues.push(`mapEnum: 字段 "${field}" 值 "${key}" 未命中映射，无 fallback，保持原值`);
  }
}

function applyDropField(
  data: Record<string, unknown>,
  field: string,
  patch: Record<string, unknown>,
  issues: string[],
): void {
  if (!(field in data)) {
    issues.push(`dropField: 字段 "${field}" 不存在，跳过`);
    return;
  }
  patch[field] = undefined; // 标记删除
}

// ---------------------------------------------------------------------------
// 主入口
// ---------------------------------------------------------------------------

/**
 * 对单个节点的 data 字段应用算子列表，返回变更集和告警。
 *
 * @param data   节点的业务数据字段（不含 STRUCT_KEYS）
 * @param ops    有序算子列表
 * @returns      { patch, issues }
 */
export function applyOps(
  data: Record<string, unknown>,
  ops: MigrationOpDto[],
): ApplyOpsResult {
  const patch: Record<string, unknown> = {};
  const issues: string[] = [];

  // 工作副本：在应用算子间保持当前值（算子链式作用）
  const working: Record<string, unknown> = { ...data };

  for (const op of ops) {
    switch (op.op) {
      case 'renameField':
        if (!op.from || !op.to) {
          issues.push(`renameField: 缺少 from 或 to 参数，跳过`);
          break;
        }
        applyRenameField(working, op.from, op.to, patch, issues);
        // 同步更新 working（链式算子可感知前序变更）
        if (op.from in patch) {
          delete working[op.from];
        }
        if (op.to in patch && patch[op.to] !== undefined) {
          working[op.to] = patch[op.to];
        }
        break;

      case 'setDefault':
        if (!op.field) {
          issues.push(`setDefault: 缺少 field 参数，跳过`);
          break;
        }
        applySetDefault(working, op.field, op.value, op.onlyIfEmpty ?? false, patch, issues);
        if (op.field in patch) {
          working[op.field] = patch[op.field];
        }
        break;

      case 'convertType':
        if (!op.field) {
          issues.push(`convertType: 缺少 field 参数，跳过`);
          break;
        }
        if (!op.convertTo) {
          issues.push(`convertType: 缺少 convertTo 参数，跳过`);
          break;
        }
        applyConvertType(
          working,
          op.field,
          op.convertTo,
          op.parse,
          op.format,
          op.onError ?? 'markIssue',
          patch,
          issues,
        );
        if (op.field in patch) {
          working[op.field] = patch[op.field];
        }
        break;

      case 'mapEnum':
        if (!op.field) {
          issues.push(`mapEnum: 缺少 field 参数，跳过`);
          break;
        }
        if (!op.mapping) {
          issues.push(`mapEnum: 缺少 mapping 参数，跳过`);
          break;
        }
        applyMapEnum(working, op.field, op.mapping, op.fallback, patch, issues);
        if (op.field in patch) {
          working[op.field] = patch[op.field];
        }
        break;

      case 'dropField':
        if (!op.field) {
          issues.push(`dropField: 缺少 field 参数，跳过`);
          break;
        }
        applyDropField(working, op.field, patch, issues);
        if (op.field in patch) {
          delete working[op.field];
        }
        break;

      default: {
        // TypeScript exhaustive check（不应到达此处）
        const _exhaustive: never = op.op;
        issues.push(`未知算子 "${String(_exhaustive)}"，跳过`);
        break;
      }
    }
  }

  // 若 patch 中无任何 key，返回 null 表示无变更
  const hasChanges = Object.keys(patch).length > 0;
  return { patch: hasChanges ? patch : null, issues };
}

// ---------------------------------------------------------------------------
// 逐算子统计辅助（用于 preview 返回的 perOp 字段）
// ---------------------------------------------------------------------------

export interface PerOpStat {
  op: string;
  ok: number;
  fail: number;
}

/** 将多次 applyOps 调用的统计结果聚合为 perOp 列表 */
export function buildPerOpStats(
  ops: MigrationOpDto[],
  patchResults: Array<{ patch: Record<string, unknown> | null; issues: string[] }>,
): PerOpStat[] {
  const stats = new Map<string, PerOpStat>(
    ops.map((op) => [op.op, { op: op.op, ok: 0, fail: 0 }]),
  );

  for (const { issues } of patchResults) {
    for (const issue of issues) {
      // 从 issue 消息中解析算子名（约定以 "opName:" 开头）
      for (const op of ops) {
        if (issue.startsWith(`${op.op}:`)) {
          const stat = stats.get(op.op);
          if (stat) stat.fail++;
        }
      }
    }
  }

  // ok = 有 patch 中对应字段变更的次数（简化统计：有 patch 就算 ok，issue 计入 fail）
  for (const { patch, issues } of patchResults) {
    if (patch !== null) {
      const failOps = new Set(
        issues.map((msg) => {
          for (const op of ops) {
            if (msg.startsWith(`${op.op}:`)) return op.op;
          }
          return null;
        }),
      );
      for (const op of ops) {
        const stat = stats.get(op.op);
        if (stat && !failOps.has(op.op)) {
          stat.ok++;
        }
      }
    }
  }

  return [...stats.values()];
}
