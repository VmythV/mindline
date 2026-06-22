import type { NodeView } from './types';

/** 分层径向树布局参数。 */
const LAYER_GAP = 6; // 每加深一层 Y 下沉的距离
const RADIUS_STEP = 7; // 每加深一层向外扩张的半径

export type Layout3dMode = 'tree' | 'sphere';

export interface Layout3dResult {
  /** nodeId → [x, y, z] */
  positions: Map<string, [number, number, number]>;
  /** 父子边 [parentId, childId] */
  edges: [string, string][];
}

/** 按 parentId 分组并按 order 升序（与 layout.ts 一致）。 */
function groupByParent(nodes: NodeView[]): Map<string | null, NodeView[]> {
  const byParent = new Map<string | null, NodeView[]>();
  for (const n of nodes) {
    const list = byParent.get(n.parentId) ?? [];
    list.push(n);
    byParent.set(n.parentId, list);
  }
  for (const list of byParent.values()) {
    list.sort((a, b) => (a.order < b.order ? -1 : a.order > b.order ? 1 : 0));
  }
  return byParent;
}

/** 父子边（两种布局通用）。 */
function collectEdges(byParent: Map<string | null, NodeView[]>): [string, string][] {
  const edges: [string, string][] = [];
  for (const [parent, children] of byParent) {
    if (parent === null) continue;
    for (const c of children) edges.push([parent, c.id]);
  }
  return edges;
}

/**
 * 3D 布局（F10）：
 * - tree：分层径向树——根居中（depth 0），每加深一层 Y 下沉、半径外扩；同层节点沿父扇区均分，保持父子邻近。
 * - sphere：径向球面——按 DFS 序在球面上 Fibonacci 均布，depth 映射同心球壳半径，视觉鸟瞰。
 */
export function layout3d(nodes: NodeView[], mode: Layout3dMode = 'tree'): Layout3dResult {
  const byParent = groupByParent(nodes);
  const edges = collectEdges(byParent);
  const positions = new Map<string, [number, number, number]>();
  const roots = byParent.get(null) ?? [];

  if (mode === 'sphere') {
    // DFS 收集 (id, depth)
    const order: { id: string; depth: number }[] = [];
    const seen = new Set<string>();
    const visit = (id: string, depth: number) => {
      if (seen.has(id)) return;
      seen.add(id);
      order.push({ id, depth });
      for (const c of byParent.get(id) ?? []) visit(c.id, depth + 1);
    };
    for (const r of roots) visit(r.id, 0);

    const n = order.length;
    const golden = Math.PI * (3 - Math.sqrt(5)); // 黄金角
    order.forEach((o, i) => {
      const radius = 8 + o.depth * 5; // depth 越深，球壳越大
      const y = n > 1 ? 1 - (i / (n - 1)) * 2 : 0; // [-1,1]
      const ring = Math.sqrt(Math.max(0, 1 - y * y));
      const theta = golden * i;
      positions.set(o.id, [
        radius * ring * Math.cos(theta),
        radius * y,
        radius * ring * Math.sin(theta),
      ]);
    });
    return { positions, edges };
  }

  // tree：分层径向树（扇区分配，带防环）
  const seen = new Set<string>();
  const place = (id: string, depth: number, a0: number, a1: number) => {
    if (seen.has(id)) return;
    seen.add(id);
    const angle = (a0 + a1) / 2;
    const r = depth * RADIUS_STEP;
    positions.set(id, [r * Math.cos(angle), -depth * LAYER_GAP, r * Math.sin(angle)]);
    const children = byParent.get(id) ?? [];
    const span = (a1 - a0) / Math.max(children.length, 1);
    children.forEach((c, i) => place(c.id, depth + 1, a0 + i * span, a0 + (i + 1) * span));
  };
  const rootSpan = (2 * Math.PI) / Math.max(roots.length, 1);
  roots.forEach((root, i) => place(root.id, 0, i * rootSpan, (i + 1) * rootSpan));

  return { positions, edges };
}
