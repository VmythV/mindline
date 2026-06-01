import type { Edge, Node } from '@xyflow/react';
import type { NodeView } from './types';

const COL = 240;
const ROW = 72;
export { COL, ROW };

/** 虚影（AI 提案预览）节点的附加渲染信息。 */
export interface ShadowMeta {
  tempId: string;
  accepted: boolean;
  valid: boolean;
  issues: string[];
}

export interface CardData extends Record<string, unknown> {
  node: NodeView;
  shadow?: ShadowMeta;
  /** 该节点处于折叠态（其子树被隐藏）。 */
  collapsed?: boolean;
  /** 直接子节点数（折叠态下用于角标提示隐藏了多少）。 */
  childCount?: number;
}

/**
 * 简单层级树布局：x 按深度，y 按 DFS 叶子顺序，父节点居中于子节点。
 * collapsedIds 中节点的整棵子树不参与布局/渲染（折叠/展开，附录B `Cmd+.`）。
 */
export function layout(
  nodes: NodeView[],
  collapsedIds?: Set<string>,
): { rfNodes: Node<CardData>[]; rfEdges: Edge[] } {
  const childrenOf = new Map<string | null, NodeView[]>();
  for (const n of nodes) {
    const list = childrenOf.get(n.parentId) ?? [];
    list.push(n);
    childrenOf.set(n.parentId, list);
  }

  // 折叠：标记所有被折叠节点的后代为隐藏
  const hidden = new Set<string>();
  if (collapsedIds?.size) {
    const markHidden = (id: string) => {
      for (const c of childrenOf.get(id) ?? []) {
        hidden.add(c.id);
        markHidden(c.id);
      }
    };
    for (const id of collapsedIds) markHidden(id);
  }

  const byParent = new Map<string | null, NodeView[]>();
  for (const n of nodes) {
    if (hidden.has(n.id)) continue;
    const list = byParent.get(n.parentId) ?? [];
    list.push(n);
    byParent.set(n.parentId, list);
  }
  for (const list of byParent.values()) {
    list.sort((a, b) => (a.order < b.order ? -1 : a.order > b.order ? 1 : 0));
  }

  const pos = new Map<string, { x: number; y: number }>();
  let cursor = 0;

  const walk = (id: string, depth: number) => {
    const children = byParent.get(id) ?? [];
    if (children.length === 0) {
      pos.set(id, { x: depth * COL, y: cursor * ROW });
      cursor += 1;
      return;
    }
    for (const c of children) walk(c.id, depth + 1);
    const ys = children.map((c) => pos.get(c.id)?.y ?? 0);
    pos.set(id, { x: depth * COL, y: (Math.min(...ys) + Math.max(...ys)) / 2 });
  };

  for (const root of byParent.get(null) ?? []) walk(root.id, 0);

  const visible = nodes.filter((n) => !hidden.has(n.id));
  const rfNodes: Node<CardData>[] = visible.map((n) => {
    const childCount = (childrenOf.get(n.id) ?? []).length;
    return {
      id: n.id,
      position: pos.get(n.id) ?? { x: 0, y: 0 },
      data: {
        node: n,
        collapsed: collapsedIds?.has(n.id) && childCount > 0,
        childCount,
      },
      type: 'card',
    };
  });

  const rfEdges: Edge[] = visible
    .filter((n) => n.parentId && !hidden.has(n.parentId))
    .map((n) => ({
      id: `e-${n.parentId}-${n.id}`,
      source: n.parentId as string,
      target: n.id,
      type: 'smoothstep',
    }));

  return { rfNodes, rfEdges };
}
