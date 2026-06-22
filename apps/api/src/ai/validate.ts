import type { NodeTypeDefinition, Proposal, ProposalModelMeta, ProposalOp } from '@mindline/shared';
import type { RawNode } from './gateway';

interface BuildProposalParams {
  rawNodes: RawNode[];
  schema: NodeTypeDefinition | null;
  targetType: string;
  anchorNodeId: string;
  mapId: string;
  proposalId: string;
  batchId: string;
  maxChildren: number;
  existingChildTitles: string[];
  modelMeta: ProposalModelMeta;
}

export interface ValidateNodeParams {
  raw: RawNode;
  index: number;
  tempId: string;
  parentRef: string;
  targetType: string;
  schema: NodeTypeDefinition | null;
  existing: Set<string>;
}

/**
 * 单节点规整 + 校验（AI拆解详设 §5）：标题裁剪、Schema 字段校验（必填/enum/multiEnum）、查重。
 * 问题不丢弃，valid:false + issues 列出。供单层与多层（depth>1）拆解共用。
 */
export function validateNode(p: ValidateNodeParams): ProposalOp {
  const issues: string[] = [];
  const title = (p.raw.title ?? '').trim().slice(0, 60) || `子节点 ${p.index + 1}`;
  const data: Record<string, unknown> = { ...(p.raw.data ?? {}) };

  if (p.schema) {
    for (const f of p.schema.fields) {
      const v = data[f.key];
      const empty = v === undefined || v === null || v === '';
      if (empty) {
        if (f.required) {
          if (f.default !== undefined) data[f.key] = f.default;
          else issues.push(`缺少必填字段「${f.label}」`);
        }
        continue;
      }
      if (f.type === 'enum' && f.options && !f.options.includes(String(v))) {
        issues.push(`字段「${f.label}」取值不在选项内：${String(v)}`);
      }
      if (f.type === 'multiEnum' && Array.isArray(v) && f.options) {
        const bad = v.filter((x) => !f.options!.includes(String(x)));
        if (bad.length) issues.push(`字段「${f.label}」含非法选项：${bad.join(', ')}`);
      }
    }
  }

  if (p.existing.has(title)) issues.push('与已有子节点标题重复');

  return {
    tempId: p.tempId,
    op: 'addChild',
    parentRef: p.parentRef,
    node: { type: p.targetType, title, data },
    valid: issues.length === 0,
    issues,
  };
}

/**
 * 规整 + 校验单层拆解结果（AI拆解详设 §4/§5）：截断到 maxChildren，逐节点 validateNode。
 * tempId 为 t1..tn（单层）。多层（depth>1）由 ai.service 直接用 validateNode 组装全局唯一 tempId。
 */
export function buildProposal(p: BuildProposalParams): Proposal {
  const existing = new Set(p.existingChildTitles.map((t) => t.trim()).filter(Boolean));
  const limited = p.rawNodes.slice(0, p.maxChildren);

  const ops: ProposalOp[] = limited.map((raw, i) =>
    validateNode({
      raw,
      index: i,
      tempId: `t${i + 1}`,
      parentRef: p.anchorNodeId,
      targetType: p.targetType,
      schema: p.schema,
      existing,
    }),
  );

  return {
    proposalId: p.proposalId,
    capability: 'decompose',
    mapId: p.mapId,
    anchorNodeId: p.anchorNodeId,
    batchId: p.batchId,
    ops,
    modelMeta: p.modelMeta,
  };
}
