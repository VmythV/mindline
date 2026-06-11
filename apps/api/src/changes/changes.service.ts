import { ForbiddenException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { and, desc, eq, gte, lte, sql } from 'drizzle-orm';
import * as Y from 'yjs';
import { type NodeSnapshot, type Role } from '@mindline/shared';
import { schema, type Database } from '@mindline/db';
import { DRIZZLE } from '../db/db.module';
import { hasMinRole } from '../common/roles';
import type { AppendChangesDto } from './dto/append-changes.dto';

interface Ctx {
  userId: string;
  tenantId: string;
}

/** 时间轴/历史查询的可选过滤条件。 */
interface ListOpts {
  limit?: number;
  nodeId?: string;
  actor?: string;
  op?: string;
  branch?: string;
  from?: number;
  to?: number;
  cursor?: string | null;
}

/** 快照节点的顶层保留字段；其余键归入 data。 */
const SNAPSHOT_TOP_KEYS = new Set([
  'id',
  'parentId',
  'order',
  'type',
  'title',
  'ownerId',
  'status',
  'tags',
  'collaborators',
  'links',
  'private',
]);

/** Y.Map 节点（toJSON 后的普通对象）→ 契约快照形态。 */
function toNodeSnapshot(n: Record<string, unknown>): NodeSnapshot {
  const data: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(n)) {
    if (!SNAPSHOT_TOP_KEYS.has(k)) data[k] = v;
  }
  const snap: NodeSnapshot = {
    id: String(n.id),
    parentId: (n.parentId as string | null) ?? null,
    order: (n.order as string) ?? '',
    type: (n.type as string) ?? 'idea',
    title: (n.title as string) ?? '',
    ownerId: (n.ownerId as string | null) ?? null,
    data,
  };
  if (n.status !== undefined) snap.status = n.status as string;
  if (n.tags !== undefined) snap.tags = n.tags as string[];
  if (n.collaborators !== undefined) snap.collaborators = n.collaborators as string[];
  if (n.links !== undefined) snap.links = n.links as NodeSnapshot['links'];
  if (n.private !== undefined) snap.private = n.private as boolean;
  return snap;
}

@Injectable()
export class ChangesService {
  constructor(@Inject(DRIZZLE) private readonly db: Database) {}

  /** 校验当前用户对 map 的访问：返回 projectId + 角色；map 不存在/跨租户/非成员 → 404。 */
  async resolveMapAccess(mapId: string, ctx: Ctx) {
    const rows = await this.db
      .select({
        projectId: schema.maps.projectId,
        mapTenant: schema.maps.tenantId,
        role: schema.projectMembers.role,
      })
      .from(schema.maps)
      .innerJoin(schema.projects, eq(schema.projects.id, schema.maps.projectId))
      .leftJoin(
        schema.projectMembers,
        and(
          eq(schema.projectMembers.projectId, schema.projects.id),
          eq(schema.projectMembers.userId, ctx.userId),
        ),
      )
      .where(eq(schema.maps.id, mapId))
      .limit(1);
    const row = rows[0];
    if (!row || row.mapTenant !== ctx.tenantId || !row.role) {
      throw new NotFoundException('地图不存在');
    }
    return { projectId: row.projectId, role: row.role as Role };
  }

  /** 批量落库语义变更事件（由发起方命令层调用，Editor+）。 */
  async append(mapId: string, ctx: Ctx, dto: AppendChangesDto) {
    const { projectId, role } = await this.resolveMapAccess(mapId, ctx);
    if (!hasMinRole(role, 'editor')) throw new ForbiddenException('需要编辑权限');

    const rows = dto.events.map((e) => ({
      id: e.eventId, // D1：客户端稳定主键，重试幂等去重
      tenantId: ctx.tenantId,
      projectId,
      mapId,
      nodeId: e.nodeId,
      actorId: ctx.userId,
      op: e.op,
      field: e.field ?? null,
      before: e.before ?? null,
      after: e.after ?? null,
      batchId: e.batchId ?? null,
      pathIds: e.pathIds ?? null,
      ts: new Date(e.ts),
    }));
    // onConflictDoNothing：重复冲刷同一 eventId 不产生重复行（at-least-once + 幂等）
    await this.db.insert(schema.changeEvents).values(rows).onConflictDoNothing({
      target: schema.changeEvents.id,
    });
    return { accepted: rows.length };
  }

  /** 时间轴/历史查询（M1：按 nodeId/actor/op/branch/时间范围过滤；keyset 游标分页；附操作人显示名）。 */
  async list(mapId: string, ctx: Ctx, opts: ListOpts = {}) {
    await this.resolveMapAccess(mapId, ctx); // 成员即可（Viewer+）
    const ce = schema.changeEvents;
    const conds = [eq(ce.mapId, mapId)];
    if (opts.nodeId) conds.push(eq(ce.nodeId, opts.nodeId));
    if (opts.actor) conds.push(eq(ce.actorId, opts.actor));
    if (opts.op) conds.push(eq(ce.op, opts.op));
    if (opts.from) conds.push(gte(ce.ts, new Date(opts.from)));
    if (opts.to) conds.push(lte(ce.ts, new Date(opts.to)));
    // branch：命中子树根自身，或其 path_ids（祖先链，不含自身）含该根 → 走 ix_changes_path GIN
    if (opts.branch) {
      conds.push(sql`(${ce.nodeId} = ${opts.branch} or ${opts.branch} = any(${ce.pathIds}))`);
    }
    // keyset 游标：按 (ts, id) 降序翻页，cursor 形如 "<tsMillis>:<id>"
    if (opts.cursor) {
      const [tsStr, idStr] = opts.cursor.split(':');
      const cTs = Number(tsStr);
      if (Number.isFinite(cTs) && idStr) {
        // 注意：裸 sql 模板不可直接绑定 Date，用 to_timestamp(秒) 传数字
        conds.push(sql`(${ce.ts}, ${ce.id}) < (to_timestamp(${cTs / 1000}), ${idStr})`);
      }
    }
    const limit = Math.min(opts.limit ?? 100, 200);
    const rows = await this.db
      .select({
        id: ce.id,
        nodeId: ce.nodeId,
        actorId: ce.actorId,
        actorName: schema.users.displayName,
        op: ce.op,
        field: ce.field,
        before: ce.before,
        after: ce.after,
        batchId: ce.batchId,
        ts: ce.ts,
      })
      .from(ce)
      .leftJoin(schema.users, eq(schema.users.id, ce.actorId))
      .where(and(...conds))
      .orderBy(desc(ce.ts), desc(ce.id))
      .limit(limit + 1);
    const hasMore = rows.length > limit;
    const page = hasMore ? rows.slice(0, limit) : rows;
    const last = page[page.length - 1];
    return {
      items: page.map((r) => ({
        id: r.id,
        nodeId: r.nodeId,
        actorId: r.actorId,
        actorName: r.actorName ?? '未知',
        op: r.op,
        field: r.field,
        before: r.before,
        after: r.after,
        batchId: r.batchId,
        ts: r.ts.getTime(),
      })),
      nextCursor: hasMore && last ? `${last.ts.getTime()}:${last.id}` : null,
    };
  }

  /** 单节点字段级历史（倒序）。路由仅带 nodeId，反查其 map 做鉴权；无事件则返回空。 */
  async nodeHistory(
    nodeId: string,
    ctx: Ctx,
    opts: { limit?: number; cursor?: string | null } = {},
  ) {
    const found = await this.db
      .select({ mapId: schema.changeEvents.mapId })
      .from(schema.changeEvents)
      .where(
        and(eq(schema.changeEvents.nodeId, nodeId), eq(schema.changeEvents.tenantId, ctx.tenantId)),
      )
      .limit(1);
    const mapId = found[0]?.mapId;
    if (!mapId) return { nodeId, items: [], nextCursor: null };
    const res = await this.list(mapId, ctx, {
      nodeId,
      limit: opts.limit,
      cursor: opts.cursor,
    });
    return { nodeId, items: res.items, nextCursor: res.nextCursor };
  }

  /**
   * 批量解析跨项目节点引用：根据 nodeId 列表查找节点标题、所属 mapId、项目名称。
   * 节点存储在 Yjs 快照里，需要逐 map 解码——对引用数量有合理上限（每次最多 50 个）。
   */
  async resolveNodeRefs(nodeIds: string[], ctx: Ctx) {
    if (nodeIds.length === 0) return [];
    const limited = nodeIds.slice(0, 50);

    // 找到这些节点出现过的 change_events（可能在多个 map 里）
    const events = await this.db
      .select({ nodeId: schema.changeEvents.nodeId, mapId: schema.changeEvents.mapId })
      .from(schema.changeEvents)
      .where(
        and(
          eq(schema.changeEvents.tenantId, ctx.tenantId),
          sql`${schema.changeEvents.nodeId} IN ${limited}`,
        ),
      )
      .groupBy(schema.changeEvents.nodeId, schema.changeEvents.mapId)
      .limit(100);

    // mapId → nodeId 集合
    const mapToNodes = new Map<string, Set<string>>();
    for (const e of events) {
      const s = mapToNodes.get(e.mapId) ?? new Set();
      s.add(e.nodeId);
      mapToNodes.set(e.mapId, s);
    }

    // 加载各 map 快照，提取目标节点
    const result: {
      nodeId: string;
      title: string;
      mapId: string;
      projectName: string;
    }[] = [];

    for (const [mapId, wantedIds] of mapToNodes) {
      // 检查调用方是否有该 map 访问权
      try {
        const { projectId } = await this.resolveMapAccess(mapId, ctx);
        const projectRows = await this.db
          .select({ name: schema.projects.name })
          .from(schema.projects)
          .where(eq(schema.projects.id, projectId))
          .limit(1);
        const projectName = projectRows[0]?.name ?? '';

        const snaps = await this.db
          .select({ state: schema.yjsSnapshots.state })
          .from(schema.yjsSnapshots)
          .where(eq(schema.yjsSnapshots.mapId, mapId))
          .orderBy(desc(schema.yjsSnapshots.version))
          .limit(1);
        if (!snaps[0]) continue;
        const doc = new Y.Doc();
        Y.applyUpdate(doc, new Uint8Array(snaps[0].state));
        const raw = doc.getMap('nodes').toJSON() as Record<string, Record<string, unknown>>;
        doc.destroy();
        for (const nid of wantedIds) {
          const n = raw[nid];
          if (!n) continue;
          result.push({
            nodeId: nid,
            title: (n['title'] as string | undefined) ?? '',
            mapId,
            projectName,
          });
        }
      } catch {
        // 无权访问该 map，跳过
      }
    }

    return result;
  }

  /** 只读快照：解码该 map 最近落库的 Yjs 全量快照为扁平节点 JSON（导出/3D/搜索/AI 上下文用）。 */
  async snapshot(mapId: string, ctx: Ctx) {
    await this.resolveMapAccess(mapId, ctx); // 成员即可（Viewer+）
    const rows = await this.db
      .select({ version: schema.yjsSnapshots.version, state: schema.yjsSnapshots.state })
      .from(schema.yjsSnapshots)
      .where(eq(schema.yjsSnapshots.mapId, mapId))
      .orderBy(desc(schema.yjsSnapshots.version))
      .limit(1);
    const generatedAt = Date.now();
    const snap = rows[0];
    if (!snap) return { mapId, version: 0, nodes: [] as NodeSnapshot[], generatedAt };
    const doc = new Y.Doc();
    Y.applyUpdate(doc, new Uint8Array(snap.state));
    const raw = doc.getMap('nodes').toJSON() as Record<string, Record<string, unknown>>;
    doc.destroy();
    const nodes = Object.values(raw).map((n) => toNodeSnapshot(n));
    return { mapId, version: snap.version, nodes, generatedAt };
  }
}
