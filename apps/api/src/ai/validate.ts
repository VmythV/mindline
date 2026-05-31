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

/**
 * 规整 + 校验（AI拆解详设 §4/§5）：
 *  - 业务约束：截断到 maxChildren；与已有子节点标题查重（标 issue，仍进预览）。
 *  - Schema 校验（逐节点）：必填缺失→填 default 或标 issue；enum 越界→标 issue。
 *  - 问题节点不丢弃，valid:false + issues 列出（前端默认不勾选）。
 */
export function buildProposal(p: BuildProposalParams): Proposal {
  const existing = new Set(p.existingChildTitles.map((t) => t.trim()).filter(Boolean));
  const limited = p.rawNodes.slice(0, p.maxChildren);

  const ops: ProposalOp[] = limited.map((raw, i) => {
    const issues: string[] = [];
    const title = (raw.title ?? '').trim().slice(0, 60) || `子节点 ${i + 1}`;
    const data: Record<string, unknown> = { ...(raw.data ?? {}) };

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

    if (existing.has(title)) issues.push('与已有子节点标题重复');

    return {
      tempId: `t${i + 1}`,
      op: 'addChild',
      parentRef: p.anchorNodeId,
      node: { type: p.targetType, title, data },
      valid: issues.length === 0,
      issues,
    };
  });

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
