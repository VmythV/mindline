import * as Y from 'yjs';
import { generateKeyBetween } from 'fractional-indexing';
import { newId, type ChangeOp, type Proposal, type NodeLink } from '@mindline/shared';
import type { NodeView } from './types';

export interface EmitEvent {
  nodeId: string;
  op: ChangeOp;
  field?: string;
  before?: unknown;
  after?: unknown;
  batchId?: string;
  pathIds?: string[];
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

  private static readonly STRUCT_KEYS = new Set([
    'id',
    'parentId',
    'order',
    'type',
    'title',
    'private',
  ]);

  /** 通用 data 字段（不随类型切换判废）：富文本正文 desc、废弃登记表本身。 */
  private static readonly SYSTEM_DATA_KEYS = new Set(['desc', '_deprecatedFields']);

  private toView(ym: YNode): NodeView {
    const data: Record<string, unknown> = {};
    ym.forEach((v, k) => {
      if (!MapRepository.STRUCT_KEYS.has(k)) data[k] = v;
    });
    return {
      id: ym.get('id') as string,
      parentId: (ym.get('parentId') as string | null) ?? null,
      order: ym.get('order') as string,
      type: (ym.get('type') as string) ?? 'idea',
      title: (ym.get('title') as string) ?? '',
      private: (ym.get('private') as boolean | undefined) ?? false,
      data,
    };
  }

  /** 切换节点私有状态（软权限 §3）。子节点通过 effectivePrivate 继承，无需逐一修改。 */
  setPrivate(id: string, value: boolean): void {
    const node = this.nodes.get(id);
    if (!node) return;
    const before = (node.get('private') as boolean | undefined) ?? false;
    if (before === value) return;
    this.doc.transact(() => node.set('private', value), this.origin);
    this.onChanges([
      {
        nodeId: id,
        op: 'setField',
        field: 'private',
        before,
        after: value,
        pathIds: this.getAncestorIds(id),
        ts: Date.now(),
      },
    ]);
  }

  /** 添加跨项目节点/子项目引用链接。 */
  addLink(id: string, link: NodeLink): void {
    const node = this.nodes.get(id);
    if (!node) return;
    const prev = (node.get('links') as NodeLink[] | undefined) ?? [];
    if (prev.some((l) => l.targetId === link.targetId && l.kind === link.kind)) return;
    const next = [...prev, link];
    this.doc.transact(() => node.set('links', next), this.origin);
    this.onChanges([
      {
        nodeId: id,
        op: 'setField',
        field: 'links',
        before: prev,
        after: next,
        pathIds: this.getAncestorIds(id),
        ts: Date.now(),
      },
    ]);
  }

  /** 移除跨项目引用链接（按 targetId + kind 匹配）。 */
  removeLink(id: string, targetId: string, kind: NodeLink['kind']): void {
    const node = this.nodes.get(id);
    if (!node) return;
    const prev = (node.get('links') as NodeLink[] | undefined) ?? [];
    const next = prev.filter((l) => !(l.targetId === targetId && l.kind === kind));
    if (next.length === prev.length) return;
    this.doc.transact(() => node.set('links', next), this.origin);
    this.onChanges([
      {
        nodeId: id,
        op: 'setField',
        field: 'links',
        before: prev,
        after: next,
        pathIds: this.getAncestorIds(id),
        ts: Date.now(),
      },
    ]);
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

  private makeNode(
    id: string,
    parentId: string | null,
    order: string,
    type: string,
    title: string,
  ) {
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
    this.onChanges([
      {
        nodeId: id,
        op: 'create',
        after: { title: '中心主题', parentId: null },
        pathIds: this.getAncestorIds(id),
        ts: Date.now(),
      },
    ]);
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
    this.onChanges([
      {
        nodeId: id,
        op: 'create',
        after: { title, parentId },
        pathIds: this.getAncestorIds(id),
        ts: Date.now(),
      },
    ]);
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
    this.onChanges([
      {
        nodeId: id,
        op: 'create',
        after: { title, parentId },
        pathIds: this.getAncestorIds(id),
        ts: Date.now(),
      },
    ]);
    return id;
  }

  rename(id: string, title: string): void {
    const node = this.nodes.get(id);
    if (!node) return;
    const before = node.get('title') as string;
    if (before === title) return;
    this.doc.transact(() => node.set('title', title), this.origin);
    this.onChanges([
      {
        nodeId: id,
        op: 'rename',
        before,
        after: title,
        pathIds: this.getAncestorIds(id),
        ts: Date.now(),
      },
    ]);
  }

  /** 设置结构字段（如富文本正文 desc）。M0 简化：值整体替换同步（非字符级协同）。 */
  setField(id: string, field: string, value: unknown): void {
    const node = this.nodes.get(id);
    if (!node) return;
    const before = node.get(field);
    if (before === value) return;
    this.doc.transact(() => node.set(field, value), this.origin);
    this.onChanges([
      {
        nodeId: id,
        op: 'setField',
        field,
        before,
        after: value,
        pathIds: this.getAncestorIds(id),
        ts: Date.now(),
      },
    ]);
  }

  /**
   * 切换节点类型（A10）：旧值一律保留；不在新类型 Schema 的旧字段登记到 `_deprecatedFields`
   * 并以只读形式呈现；若新类型重新包含某废弃字段则自动复活。validFieldKeys 由调用方按新类型 Schema 传入。
   */
  setType(id: string, newType: string, validFieldKeys: string[]): void {
    const node = this.nodes.get(id);
    if (!node) return;
    const before = node.get('type') as string;
    if (before === newType) return;
    const valid = new Set(validFieldKeys);
    const nowDeprecated: string[] = [];
    node.forEach((_v, k) => {
      if (MapRepository.STRUCT_KEYS.has(k) || MapRepository.SYSTEM_DATA_KEYS.has(k)) return;
      if (!valid.has(k)) nowDeprecated.push(k);
    });
    const prev = (node.get('_deprecatedFields') as string[] | undefined) ?? [];
    const stillDeprecated = prev.filter((k) => !valid.has(k)); // 新类型重新含的字段复活
    const merged = Array.from(new Set([...stillDeprecated, ...nowDeprecated]));
    this.doc.transact(() => {
      node.set('type', newType);
      node.set('_deprecatedFields', merged);
    }, this.origin);
    this.onChanges([
      {
        nodeId: id,
        op: 'setField',
        field: 'type',
        before,
        after: newType,
        pathIds: this.getAncestorIds(id),
        ts: Date.now(),
      },
    ]);
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
    // 删除前快照各节点祖先链（删后无法再取）；D2：记录事件发生时的链
    const paths = new Map<string, string[]>();
    toDelete.forEach((nid) => paths.set(nid, this.getAncestorIds(nid)));
    this.doc.transact(() => {
      toDelete.forEach((nid) => this.nodes.delete(nid));
    }, this.origin);
    this.onChanges(
      toDelete.map((nid) => ({
        nodeId: nid,
        op: 'delete' as ChangeOp,
        batchId,
        pathIds: paths.get(nid),
        ts,
      })),
    );
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

  /** 该节点的祖先 id 链（不含自身，由近到远）。用于 ChangeEvent.path_ids（D2：记录事件发生时的链）。 */
  getAncestorIds(nodeId: string): string[] {
    const out: string[] = [];
    const seen = new Set<string>([nodeId]); // 防御性：避免异常环导致死循环
    let pid = (this.nodes.get(nodeId)?.get('parentId') as string | null) ?? null;
    while (pid && !seen.has(pid)) {
      out.push(pid);
      seen.add(pid);
      pid = (this.nodes.get(pid)?.get('parentId') as string | null) ?? null;
    }
    return out;
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
    // 移动前快照旧分支祖先链（D2：归属事件发生时所在分支）
    const pathIds = this.getAncestorIds(nodeId);
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
        pathIds,
        ts: Date.now(),
      },
    ]);
  }

  /**
   * 应用 AI 提案（确认后写入）：仅写入 accepted 的 op，单事务建节点，
   * tempId→realId 映射解析 parentRef（命中 tempId 则用新建 id，否则视为真实 id）；
   * 共享 proposal.batchId 产出 aiGenerate 事件（M1 时间轴折叠为一条批量事件）。
   */
  applyProposal(
    proposal: Proposal,
    accepted: Set<string>,
    edits: Record<string, string>,
  ): string[] {
    const ops = proposal.ops.filter((o) => accepted.has(o.tempId));
    if (!ops.length) return [];
    const tempToReal = new Map<string, string>();
    const created: string[] = [];
    this.doc.transact(() => {
      for (const op of ops) {
        const id = newId('node');
        tempToReal.set(op.tempId, id);
        const ref = op.parentRef ?? proposal.anchorNodeId;
        const parentId = tempToReal.get(ref) ?? ref;
        const sibs = this.siblings(parentId);
        const order = generateKeyBetween(sibs[sibs.length - 1]?.order ?? null, null);
        const title = edits[op.tempId] ?? op.node?.title ?? '新节点';
        const type = op.node?.type ?? 'idea';
        const ym = this.makeNode(id, parentId, order, type, title);
        const data = op.node?.data ?? {};
        for (const [k, v] of Object.entries(data)) {
          if (v !== undefined && !MapRepository.STRUCT_KEYS.has(k)) ym.set(k, v);
        }
        this.nodes.set(id, ym);
        created.push(id);
      }
    }, this.origin);
    const ts = Date.now();
    this.onChanges(
      created.map((nodeId) => ({
        nodeId,
        op: 'aiGenerate' as ChangeOp,
        batchId: proposal.batchId,
        pathIds: this.getAncestorIds(nodeId),
        ts,
      })),
    );
    return created;
  }

  /**
   * 撤销 / 重做（A9）。UndoManager 已限定 trackedOrigins=本地 origin，故只撤自己的操作。
   * 通过「前后快照 diff」反推补偿 ChangeEvent 落库 —— 撤销/重做后文档与时间轴保持一致。
   * 整次撤销/重做归一个 batchId（时间轴折叠为一条批量事件）。
   */
  undo(): void {
    const before = this.snapshot();
    this.undoManager.undo();
    this.emitDiff(before, this.snapshot());
  }

  redo(): void {
    const before = this.snapshot();
    this.undoManager.redo();
    this.emitDiff(before, this.snapshot());
  }

  /** 全量节点视图按 id 索引（撤销/重做 diff 用）。 */
  private snapshot(): Map<string, NodeView> {
    const m = new Map<string, NodeView>();
    for (const v of this.list()) m.set(v.id, v);
    return m;
  }

  /** 从快照（而非当前文档）回溯祖先链 —— 供已被删除的节点计算 pathIds。 */
  private ancestorIdsFromSnap(snap: Map<string, NodeView>, nodeId: string): string[] {
    const out: string[] = [];
    const seen = new Set<string>([nodeId]);
    let pid = snap.get(nodeId)?.parentId ?? null;
    while (pid && !seen.has(pid)) {
      out.push(pid);
      seen.add(pid);
      pid = snap.get(pid)?.parentId ?? null;
    }
    return out;
  }

  /** 对比撤销/重做前后两份快照，产出补偿 ChangeEvent（共享 batchId）。 */
  private emitDiff(before: Map<string, NodeView>, after: Map<string, NodeView>): void {
    const batchId = newId('batch');
    const ts = Date.now();
    const events: EmitEvent[] = [];
    const differs = (a: unknown, b: unknown) =>
      JSON.stringify(a ?? null) !== JSON.stringify(b ?? null);

    // 删除：before 有、after 无（pathIds 取 before 态，因节点已不在文档）
    for (const [id] of before) {
      if (!after.has(id)) {
        events.push({
          nodeId: id,
          op: 'delete',
          batchId,
          pathIds: this.ancestorIdsFromSnap(before, id),
          ts,
        });
      }
    }
    for (const [id, a] of after) {
      const b = before.get(id);
      const pathIds = this.getAncestorIds(id);
      if (!b) {
        events.push({
          nodeId: id,
          op: 'create',
          after: { title: a.title, parentId: a.parentId },
          batchId,
          pathIds,
          ts,
        });
        continue;
      }
      if (b.title !== a.title) {
        events.push({
          nodeId: id,
          op: 'rename',
          before: b.title,
          after: a.title,
          batchId,
          pathIds,
          ts,
        });
      }
      if (b.type !== a.type) {
        events.push({
          nodeId: id,
          op: 'setField',
          field: 'type',
          before: b.type,
          after: a.type,
          batchId,
          pathIds,
          ts,
        });
      }
      if (b.parentId !== a.parentId || b.order !== a.order) {
        events.push({
          nodeId: id,
          op: 'move',
          before: { parentId: b.parentId, order: b.order },
          after: { parentId: a.parentId, order: a.order },
          batchId,
          pathIds,
          ts,
        });
      }
      for (const k of new Set([...Object.keys(b.data), ...Object.keys(a.data)])) {
        if (differs(b.data[k], a.data[k])) {
          events.push({
            nodeId: id,
            op: 'setField',
            field: k,
            before: b.data[k],
            after: a.data[k],
            batchId,
            pathIds,
            ts,
          });
        }
      }
    }
    if (events.length) this.onChanges(events);
  }
}
