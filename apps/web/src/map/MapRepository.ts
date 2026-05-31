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

  constructor(
    readonly mapId: string,
    readonly doc: Y.Doc,
    private readonly onChanges: (events: EmitEvent[]) => void,
  ) {
    this.nodes = doc.getMap<YNode>('nodes');
  }

  private toView(ym: YNode): NodeView {
    return {
      id: ym.get('id') as string,
      parentId: (ym.get('parentId') as string | null) ?? null,
      order: ym.get('order') as string,
      type: (ym.get('type') as string) ?? 'idea',
      title: (ym.get('title') as string) ?? '',
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
}
