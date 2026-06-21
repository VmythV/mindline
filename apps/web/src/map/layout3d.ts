import type { NodeView } from './types';

/** 分层径向树布局参数。 */
const LAYER_GAP = 6; // 每加深一层 Y 下沉的距离
const RADIUS_STEP = 7; // 每加深一层向外扩张的半径

export interface Layout3dResult {
  /** nodeId → [x, y, z] */
  positions: Map<string, [number, number, number]>;
  /** 父子边 [parentId, childId] */
  edges: [string, string][];
}

/**
 * 3D 分层径向树布局（F10）：根居中（depth 0），每加深一层 Y 下沉、半径外扩；
 * 同层节点沿父节点的角度扇区均分，保持父子邻近、直观体现层级。
 * 复用与 layout.ts 一致的父子分组 + order 排序，仅输出三维坐标。
 */
export function layout3d(nodes: NodeView[]): Layout3dResult {
  const byParent = new Map<string | null, NodeView[]>();
  for (const n of nodes) {
    const list = byParent.get(n.parentId) ?? [];
    list.push(n);
    byParent.set(n.parentId, list);
  }
  for (const list of byParent.values()) {
    list.sort((a, b) => (a.order < b.order ? -1 : a.order > b.order ? 1 : 0));
  }

  const positions = new Map<string, [number, number, number]>();
  const edges: [string, string][] = [];
  const seen = new Set<string>(); // 防御异常环导致无限递归

  const place = (id: string, depth: number, a0: number, a1: number) => {
    if (seen.has(id)) return;
    seen.add(id);
    const angle = (a0 + a1) / 2;
    const r = depth * RADIUS_STEP;
    positions.set(id, [r * Math.cos(angle), -depth * LAYER_GAP, r * Math.sin(angle)]);
    const children = byParent.get(id) ?? [];
    const span = (a1 - a0) / Math.max(children.length, 1);
    children.forEach((c, i) => {
      edges.push([id, c.id]);
      place(c.id, depth + 1, a0 + i * span, a0 + (i + 1) * span);
    });
  };

  const roots = byParent.get(null) ?? [];
  const rootSpan = (2 * Math.PI) / Math.max(roots.length, 1);
  roots.forEach((root, i) => place(root.id, 0, i * rootSpan, (i + 1) * rootSpan));

  return { positions, edges };
}
