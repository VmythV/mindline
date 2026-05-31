import type { NodeSnapshot } from '@mindline/shared';

/** 拆解上下文（AI拆解详设 §2）。 */
export interface DecomposeContext {
  target: { id: string; type: string; title: string; data: Record<string, unknown> };
  ancestors: { id: string; type: string; title: string }[];
  siblings: { id: string; title: string }[];
  children: { id: string; title: string }[];
  parentType: string | null;
}

const MAX_SIBLINGS = 12;
const MAX_ANCESTORS = 6;

/**
 * 从只读快照按 nodeId 组装上下文。
 * 若 target 不在快照（如新建未落库）→ 用占位 target，依赖 userPrompt/Schema 继续（不报错）。
 */
export function buildContext(
  nodes: NodeSnapshot[],
  nodeId: string,
  targetTypeFallback: string,
): DecomposeContext {
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const target = byId.get(nodeId);

  // 祖先链（由根到父，仅 title+type）
  const ancestors: DecomposeContext['ancestors'] = [];
  const seen = new Set<string>([nodeId]);
  let pid = target?.parentId ?? null;
  while (pid && !seen.has(pid)) {
    seen.add(pid);
    const p = byId.get(pid);
    if (!p) break;
    ancestors.unshift({ id: p.id, type: p.type, title: p.title });
    pid = p.parentId;
  }
  // 父链过深 → 保留根 + 直接父
  const trimmedAncestors =
    ancestors.length > MAX_ANCESTORS ? [ancestors[0]!, ...ancestors.slice(-2)] : ancestors;

  const parentType = target ? (byId.get(target.parentId ?? '')?.type ?? null) : null;

  const siblings = target
    ? nodes
        .filter((n) => n.parentId === (target.parentId ?? null) && n.id !== nodeId)
        .slice(0, MAX_SIBLINGS)
        .map((n) => ({ id: n.id, title: n.title }))
    : [];

  const children = nodes
    .filter((n) => n.parentId === nodeId)
    .map((n) => ({ id: n.id, title: n.title }));

  return {
    target: target
      ? { id: target.id, type: target.type, title: target.title, data: target.data }
      : { id: nodeId, type: targetTypeFallback, title: '(当前节点，尚未同步至快照)', data: {} },
    ancestors: trimmedAncestors,
    siblings,
    children,
    parentType,
  };
}
