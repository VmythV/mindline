import * as Y from 'yjs';
import { generateKeyBetween } from 'fractional-indexing';
import { newId, type ChangeOp } from '@mindline/shared';
import type { NodeView } from './types';

export interface EmitEvent {
  nodeId: string;
  op: ChangeOp;
  field?: string;
  before?: unknown;
  after?: unknown;
  batchId?: string;
  ts: number;
}

type YNode = Y.Map<unknown>;

/**
 * 命令层（唯一 Y.Doc 写入口，对应 Yjs协同详设 §4/§11）。
 * 每条命令在单事务内改文档（带本地 origin），并产出语义 ChangeEvent 交由 onChanges 落库。
 * M0 简化：title 暂用普通字符串（字符级协同 Y.Text 后续）。
 */
export class MapRepository {
  readonly nodes: Y.Map<YNode>;
  readonly origin = { local: true };
  readonly undoManager: Y.UndoManager;

  constructor(
    readonly mapId: string,
    readonly doc: Y.Doc,
    private readonly onChanges: (events: EmitEvent[]) => void,
  ) {
    this.nodes = doc.getMap<YNode>('nodes');
    // A9：仅跟踪本地 origin 的变更 → 撤销只影响自己的操作，不误撤他人
    this.undoManager = new Y.UndoManager(this.nodes, {
      trackedOrigins: new Set([this.origin]),
      captureTimeout: 500,
    });
  }

  private toView(ym: YNode): NodeView {
    return {
      id: ym.get('id') as string,
      parentId: (ym.get('parentId') as string | null) ?? null,
      order: ym.get('order') as string,
      type: (ym.get('type') as string) ?? 'idea',
      title: (ym.get('title') as string) ?? '',
      desc: (ym.get('desc') as string | undefined) ?? '',
    };
  }

  list(): NodeView[] {
    const arr: NodeView[] = [];
    this.nodes.forEach((ym) => arr.push(this.toView(ym)));
    return arr;
  }

  private siblings(parentId: string | null): NodeView[] {
    return this.list()
      .filter((n) => n.parentId === parentId)
      .sort((a, b) => (a.order < b.order ? -1 : a.order > b.order ? 1 : 0));
  }

  private makeNode(id: string, parentId: string | null, order: string, type: string, title: string) {
    const ym: YNode = new Y.Map();
    ym.set('id', id);
    ym.set('parentId', parentId);
    ym.set('order', order);
    ym.set('type', type);
    ym.set('title', title);
    return ym;
  }

  /** 确保存在根节点（首次进入空 map 时建一个中心主题）。 */
  ensureRoot(): string {
    const roots = this.list().filter((n) => n.parentId === null);
    if (roots[0]) return roots[0].id;
    const id = newId('node');
    const order = generateKeyBetween(null, null);
    this.doc.transact(() => {
      this.nodes.set(id, this.makeNode(id, null, order, 'idea', '中心主题'));
    }, this.origin);
    this.onChanges([{ nodeId: id, op: 'create', after: { title: '中心主题', parentId: null }, ts: Date.now() }]);
    return id;
  }

  createChild(parentId: string, title = '新节点'): string {
    const sibs = this.siblings(parentId);
    const last = sibs[sibs.length - 1];
    const order = generateKeyBetween(last?.order ?? null, null);
    const id = newId('node');
    this.doc.transact(() => {
      this.nodes.set(id, this.makeNode(id, parentId, order, 'idea', title));
    }, this.origin);
    this.onChanges([{ nodeId: id, op: 'create', after: { title, parentId }, ts: Date.now() }]);
    return id;
  }

  createSibling(nodeId: string, title = '新节点'): string {
    const node = this.nodes.get(nodeId);
    if (!node) return this.createChild(nodeId, title);
    const parentId = (node.get('parentId') as string | null) ?? null;
    if (parentId === null) return this.createChild(nodeId, title); // 根节点 → 建子
    const sibs = this.siblings(parentId);
    const idx = sibs.findIndex((n) => n.id === nodeId);
    const before = sibs[idx]?.order ?? null;
    const after = sibs[idx + 1]?.order ?? null;
    const order = generateKeyBetween(before, after);
    const id = newId('node');
    this.doc.transact(() => {
      this.nodes.set(id, this.makeNode(id, parentId, order, 'idea', title));
    }, this.origin);
    this.onChanges([{ nodeId: id, op: 'create', after: { title, parentId }, ts: Date.now() }]);
    return id;
  }

  rename(id: string, title: string): void {
    const node = this.nodes.get(id);
    if (!node) return;
    const before = node.get('title') as string;
    if (before === title) return;
    this.doc.transact(() => node.set('title', title), this.origin);
    this.onChanges([{ nodeId: id, op: 'rename', before, after: title, ts: Date.now() }]);
  }

  /** 设置结构字段（如富文本正文 desc）。M0 简化：值整体替换同步（非字符级协同）。 */
  setField(id: string, field: string, value: unknown): void {
    const node = this.nodes.get(id);
    if (!node) return;
    const before = node.get(field);
    if (before === value) return;
    this.doc.transact(() => node.set(field, value), this.origin);
    this.onChanges([{ nodeId: id, op: 'setField', field, before, after: value, ts: Date.now() }]);
  }

  deleteSubtree(id: string): void {
    const all = this.list();
    const toDelete: string[] = [];
    const collect = (nid: string) => {
      toDelete.push(nid);
      all.filter((n) => n.parentId === nid).forEach((c) => collect(c.id));
    };
    collect(id);
    const batchId = newId('batch');
    const ts = Date.now();
    this.doc.transact(() => {
      toDelete.forEach((nid) => this.nodes.delete(nid));
    }, this.origin);
    this.onChanges(toDelete.map((nid) => ({ nodeId: nid, op: 'delete' as ChangeOp, batchId, ts })));
  }

  /** 判断 maybeChildId 是否在 ancestorId 的子树内（含自身）。 */
  isDescendant(maybeChildId: string, ancestorId: string): boolean {
    let cur: string | null = maybeChildId;
    while (cur) {
      if (cur === ancestorId) return true;
      const n = this.nodes.get(cur);
      cur = n ? ((n.get('parentId') as string | null) ?? null) : null;
    }
    return false;
  }

  /** 移动节点到新父（拖拽改父）；禁止移入自身子树，落到新父末尾。 */
  moveNode(nodeId: string, newParentId: string): void {
    if (nodeId === newParentId) return;
    const node = this.nodes.get(nodeId);
    if (!node) return;
    if (this.isDescendant(newParentId, nodeId)) return;
    const oldParent = (node.get('parentId') as string | null) ?? null;
    if (oldParent === newParentId) return;
    const oldOrder = node.get('order') as string;
    const sibs = this.siblings(newParentId).filter((n) => n.id !== nodeId);
    const order = generateKeyBetween(sibs[sibs.length - 1]?.order ?? null, null);
    this.doc.transact(() => {
      node.set('parentId', newParentId);
      node.set('order', order);
    }, this.origin);
    this.onChanges([
      {
        nodeId,
        op: 'move',
        before: { parentId: oldParent, order: oldOrder },
        after: { parentId: newParentId, order },
        ts: Date.now(),
      },
    ]);
  }

  /**
   * 撤销 / 重做（A9）。UndoManager 已限定 trackedOrigins=本地 origin，故只撤自己的操作。
   * 注：撤销/重做的补偿 ChangeEvent 落库待后续完善（当前仅恢复文档结构与协同同步）。
   */
  undo(): void {
    this.undoManager.undo();
  }

  redo(): void {
    this.undoManager.redo();
  }
}
