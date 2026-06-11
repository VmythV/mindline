/**
 * Schema 迁移服务 —— Schema迁移工具详设 §4、§6、§11。
 *
 * 职责：
 *   1. preview：在内存副本上跑算子，统计影响（不落库）。
 *   2. execute：加载快照 → 应用算子 → 写新快照 + ChangeEvent。
 *   3. getStatus：查询迁移任务进度。
 *   4. rollback：事件逆放回滚（§4.2）。
 */
import {
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { and, desc, eq, inArray } from 'drizzle-orm';
import * as Y from 'yjs';
import { newId, type Role } from '@mindline/shared';
import { schema, type Database } from '@mindline/db';
import { DRIZZLE } from '../db/db.module';
import { hasMinRole } from '../common/roles';
import { applyOps, buildPerOpStats, STRUCT_KEYS } from './operators';
import type { MigrationPreviewDto } from './dto/migration-preview.dto';
import type { MigrationExecuteDto } from './dto/migration-execute.dto';

interface Ctx {
  userId: string;
  tenantId: string;
}

/** 迁移期间从 Y.Doc 提取节点 data 字段（排除结构键） */
function extractData(node: Y.Map<unknown>): Record<string, unknown> {
  const data: Record<string, unknown> = {};
  node.forEach((v, k) => {
    if (!STRUCT_KEYS.has(k)) data[k] = v;
  });
  return data;
}

/** 加载 yjsSnapshot state 到新 Y.Doc，返回 doc（调用方须 doc.destroy()） */
function loadDoc(state: Buffer): Y.Doc {
  const doc = new Y.Doc();
  Y.applyUpdate(doc, new Uint8Array(state));
  return doc;
}

/** 校验当前用户在指定项目上是否有 Admin+ 权限；失败抛出异常 */
async function checkAdminRole(
  db: Database,
  projectId: string,
  userId: string,
): Promise<void> {
  const rows = await db
    .select({ role: schema.projectMembers.role })
    .from(schema.projectMembers)
    .where(
      and(
        eq(schema.projectMembers.projectId, projectId),
        eq(schema.projectMembers.userId, userId),
      ),
    )
    .limit(1);
  const role = rows[0]?.role as Role | undefined;
  if (!role || !hasMinRole(role, 'admin')) {
    throw new ForbiddenException(`项目 ${projectId} 需要 admin 权限`);
  }
}

@Injectable()
export class SchemaMigrationsService {
  constructor(@Inject(DRIZZLE) private readonly db: Database) {}

  // -------------------------------------------------------------------------
  // 查找 typeKey 在该租户下关联的所有项目 + maps
  // -------------------------------------------------------------------------

  private async resolveProjectsAndMaps(
    typeKey: string,
    tenantId: string,
    scopeProjectIds?: string[],
  ): Promise<Array<{ projectId: string; mapId: string; mapState: Buffer; mapVersion: number }>> {
    // 1. 找租户下包含该 typeKey 的所有 schema 记录（全局 + 项目级）
    const schemaRows = await this.db
      .select({
        projectId: schema.nodeTypeSchemas.projectId,
      })
      .from(schema.nodeTypeSchemas)
      .where(
        and(
          eq(schema.nodeTypeSchemas.tenantId, tenantId),
          eq(schema.nodeTypeSchemas.typeKey, typeKey),
        ),
      );

    // 2. 收集需要处理的 projectId 集合
    //    全局类型（projectId=null）需找该租户所有 projects
    let targetProjectIds: string[] = [];

    const hasGlobal = schemaRows.some((r) => r.projectId === null);
    const projectScopedIds = schemaRows
      .filter((r) => r.projectId !== null)
      .map((r) => r.projectId as string);

    if (hasGlobal) {
      // 全局类型作用于租户所有项目
      const allProjects = await this.db
        .select({ id: schema.projects.id })
        .from(schema.projects)
        .where(eq(schema.projects.tenantId, tenantId));
      targetProjectIds = allProjects.map((p) => p.id);
    } else {
      targetProjectIds = projectScopedIds;
    }

    // 3. 若调用方指定了 scopeProjectIds，取交集
    if (scopeProjectIds && scopeProjectIds.length > 0) {
      const scopeSet = new Set(scopeProjectIds);
      targetProjectIds = targetProjectIds.filter((id) => scopeSet.has(id));
    }

    if (targetProjectIds.length === 0) return [];

    // 4. 找这些项目对应的 map
    const mapRows = await this.db
      .select({ id: schema.maps.id, projectId: schema.maps.projectId })
      .from(schema.maps)
      .where(inArray(schema.maps.projectId, targetProjectIds));

    if (mapRows.length === 0) return [];

    // 5. 取每张 map 最新快照
    const mapIds = mapRows.map((m) => m.id);
    const results: Array<{
      projectId: string;
      mapId: string;
      mapState: Buffer;
      mapVersion: number;
    }> = [];

    // 逐一查询最新版本快照（N+1 可接受，M4 首发量小）
    for (const mapRow of mapRows) {
      const snapRows = await this.db
        .select({
          version: schema.yjsSnapshots.version,
          state: schema.yjsSnapshots.state,
        })
        .from(schema.yjsSnapshots)
        .where(eq(schema.yjsSnapshots.mapId, mapRow.id))
        .orderBy(desc(schema.yjsSnapshots.version))
        .limit(1);

      if (snapRows[0]) {
        results.push({
          projectId: mapRow.projectId,
          mapId: mapRow.id,
          mapState: snapRows[0].state,
          mapVersion: snapRows[0].version,
        });
      }
    }

    // 消除 mapIds 未使用变量的警告
    void mapIds;

    return results;
  }

  // -------------------------------------------------------------------------
  // preview
  // -------------------------------------------------------------------------

  async preview(typeKey: string, tenantId: string, dto: MigrationPreviewDto) {
    const maps = await this.resolveProjectsAndMaps(typeKey, tenantId, dto.scopeProjectIds);

    let affected = 0;
    const allPatchResults: Array<{
      patch: Record<string, unknown> | null;
      issues: string[];
    }> = [];
    const samples: Array<{
      nodeId: string;
      before: Record<string, unknown>;
      after: Record<string, unknown>;
    }> = [];
    const issueList: Array<{ nodeId: string; op: string; reason: string }> = [];

    for (const { mapState } of maps) {
      const doc = loadDoc(mapState);
      try {
        const nodes = doc.getMap<Y.Map<unknown>>('nodes');
        nodes.forEach((node, nodeId) => {
          if (node.get('type') !== typeKey) return;

          const data = extractData(node);
          const { patch, issues } = applyOps(data, dto.ops);

          allPatchResults.push({ patch, issues });

          if (patch !== null) {
            affected++;
            // 收集前 5 个样本
            if (samples.length < 5) {
              const after: Record<string, unknown> = { ...data };
              for (const [k, v] of Object.entries(patch)) {
                if (v === undefined) {
                  delete after[k];
                } else {
                  after[k] = v;
                }
              }
              samples.push({ nodeId, before: data, after });
            }
          }

          // 记录 issues
          for (const reason of issues) {
            const opMatch = dto.ops.find((op) => reason.startsWith(`${op.op}:`));
            issueList.push({
              nodeId,
              op: opMatch?.op ?? 'unknown',
              reason,
            });
          }
        });
      } finally {
        doc.destroy();
      }
    }

    const perOp = buildPerOpStats(dto.ops, allPatchResults);

    return {
      affected,
      perOp,
      samples,
      issues: issueList,
    };
  }

  // -------------------------------------------------------------------------
  // execute
  // -------------------------------------------------------------------------

  async execute(typeKey: string, tenantId: string, ctx: Ctx, dto: MigrationExecuteDto) {
    const maps = await this.resolveProjectsAndMaps(typeKey, tenantId, dto.scopeProjectIds);

    // 权限校验：执行者须对每个项目有 Admin+
    const skippedProjects: Array<{ projectId: string; reason: string }> = [];
    const allowedMaps: typeof maps = [];
    for (const m of maps) {
      try {
        await checkAdminRole(this.db, m.projectId, ctx.userId);
        allowedMaps.push(m);
      } catch {
        skippedProjects.push({ projectId: m.projectId, reason: '无 Admin 权限' });
      }
    }

    const migrationId = newId('migration');

    // 创建 schemaMigrations 记录（status=running）
    await this.db.insert(schema.schemaMigrations).values({
      id: migrationId,
      tenantId,
      typeKey,
      fromVersion: dto.fromVersion,
      toVersion: dto.toVersion,
      filter: dto.filter ?? null,
      ops: dto.ops as unknown as Record<string, unknown>[],
      scopeProjectIds: dto.scopeProjectIds ?? null,
      status: 'running',
      total: 0,
      processed: 0,
      createdBy: ctx.userId,
    });

    // 同步执行（详设注：大数据量应改队列；M4 首发同步）
    let totalNodes = 0;
    let processedNodes = 0;
    let okNodes = 0;
    let skippedNodes = 0;
    const allIssues: Array<{ nodeId: string; op: string; reason: string }> = [];
    const changeEventRows: Array<{
      id: string;
      tenantId: string;
      projectId: string;
      mapId: string;
      nodeId: string;
      actorId: string;
      op: string;
      field: string | null;
      before: unknown;
      after: unknown;
      batchId: string | null;
      pathIds: string[] | null;
      ts: Date;
    }> = [];

    for (const { projectId, mapId, mapState, mapVersion } of allowedMaps) {
      const doc = loadDoc(mapState);
      try {
        const nodes = doc.getMap<Y.Map<unknown>>('nodes');

        // 收集目标节点
        const targets: Array<{ nodeId: string; node: Y.Map<unknown> }> = [];
        nodes.forEach((node, nodeId) => {
          if (node.get('type') === typeKey) targets.push({ nodeId, node });
        });

        totalNodes += targets.length;

        for (const { nodeId, node } of targets) {
          const data = extractData(node);
          const { patch, issues } = applyOps(data, dto.ops);

          for (const reason of issues) {
            const opMatch = dto.ops.find((op) => reason.startsWith(`${op.op}:`));
            allIssues.push({ nodeId, op: opMatch?.op ?? 'unknown', reason });
          }

          if (patch === null) {
            skippedNodes++;
            continue;
          }

          // 乐观校验：当前值须与预览时一致（简化：此处直接应用，生产环境可加 version check）
          doc.transact(() => {
            for (const [k, v] of Object.entries(patch)) {
              if (v === undefined) {
                node.delete(k);
              } else {
                node.set(k, v);
              }
            }
          });

          processedNodes++;
          okNodes++;

          // 为每个字段变更创建 ChangeEvent
          const ts = new Date();
          for (const [field, after] of Object.entries(patch)) {
            changeEventRows.push({
              id: newId('changeEvent'),
              tenantId,
              projectId,
              mapId,
              nodeId,
              actorId: ctx.userId,
              op: 'setField',
              field,
              before: data[field] ?? null,
              after: after ?? null,
              batchId: migrationId,
              pathIds: null,
              ts,
            });
          }
        }

        // 编码新快照写入 yjs_snapshots（version+1）
        const newState = Buffer.from(Y.encodeStateAsUpdate(doc));
        const newVersion = mapVersion + 1;
        await this.db.insert(schema.yjsSnapshots).values({
          mapId,
          version: newVersion,
          state: newState,
        });
      } finally {
        doc.destroy();
      }
    }

    // 批量写入 ChangeEvent
    if (changeEventRows.length > 0) {
      await this.db.insert(schema.changeEvents).values(changeEventRows).onConflictDoNothing({
        target: schema.changeEvents.id,
      });
    }

    // 更新 schemaMigrations 状态
    const rollbackableUntil = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // now + 7天
    await this.db
      .update(schema.schemaMigrations)
      .set({
        status: 'done',
        processed: processedNodes,
        total: totalNodes,
        result: {
          ok: okNodes,
          skipped: skippedNodes,
          issues: allIssues.length,
          skippedProjects,
        },
        rollbackableUntil,
      })
      .where(eq(schema.schemaMigrations.id, migrationId));

    return { migrationId, status: 'done' };
  }

  // -------------------------------------------------------------------------
  // getStatus
  // -------------------------------------------------------------------------

  async getStatus(migrationId: string, tenantId: string) {
    const rows = await this.db
      .select()
      .from(schema.schemaMigrations)
      .where(
        and(
          eq(schema.schemaMigrations.id, migrationId),
          eq(schema.schemaMigrations.tenantId, tenantId),
        ),
      )
      .limit(1);

    const row = rows[0];
    if (!row) throw new NotFoundException('迁移任务不存在');

    return {
      migrationId: row.id,
      status: row.status,
      processed: row.processed,
      total: row.total,
      result: row.result ?? null,
      rollbackableUntil: row.rollbackableUntil ? row.rollbackableUntil.getTime() : null,
      skippedProjects:
        (row.result as null | { skippedProjects?: Array<{ projectId: string; reason: string }> })
          ?.skippedProjects ?? [],
    };
  }

  // -------------------------------------------------------------------------
  // rollback（事件逆放，§4.2）
  // -------------------------------------------------------------------------

  async rollback(migrationId: string, tenantId: string, ctx: Ctx) {
    const rows = await this.db
      .select()
      .from(schema.schemaMigrations)
      .where(
        and(
          eq(schema.schemaMigrations.id, migrationId),
          eq(schema.schemaMigrations.tenantId, tenantId),
        ),
      )
      .limit(1);

    const migration = rows[0];
    if (!migration) throw new NotFoundException('迁移任务不存在');
    if (migration.status !== 'done') {
      throw new ConflictException(`迁移状态为 "${migration.status}"，仅 done 状态可回滚`);
    }
    if (migration.rollbackableUntil && migration.rollbackableUntil < new Date()) {
      throw new ConflictException('已超出回滚时间窗口（7天）');
    }

    // 取该批次所有 ChangeEvent（setField，batchId=migrationId）
    const events = await this.db
      .select({
        id: schema.changeEvents.id,
        mapId: schema.changeEvents.mapId,
        projectId: schema.changeEvents.projectId,
        nodeId: schema.changeEvents.nodeId,
        field: schema.changeEvents.field,
        before: schema.changeEvents.before,
        after: schema.changeEvents.after,
      })
      .from(schema.changeEvents)
      .where(
        and(
          eq(schema.changeEvents.batchId, migrationId),
          eq(schema.changeEvents.tenantId, tenantId),
        ),
      );

    if (events.length === 0) {
      // 无事件，直接标记 rolledback
      await this.db
        .update(schema.schemaMigrations)
        .set({ status: 'rolledback' })
        .where(eq(schema.schemaMigrations.id, migrationId));
      return { migrationId, status: 'rolledback', mode: 'event_replay' };
    }

    // 按 mapId 分组，逐 map 加载快照并逆放
    const byMap = new Map<string, typeof events>();
    for (const ev of events) {
      const list = byMap.get(ev.mapId) ?? [];
      list.push(ev);
      byMap.set(ev.mapId, list);
    }

    const rollbackEventRows: Array<{
      id: string;
      tenantId: string;
      projectId: string;
      mapId: string;
      nodeId: string;
      actorId: string;
      op: string;
      field: string | null;
      before: unknown;
      after: unknown;
      batchId: string | null;
      pathIds: string[] | null;
      ts: Date;
    }> = [];

    for (const [mapId, mapEvents] of byMap) {
      // 取最新快照
      const snapRows = await this.db
        .select({ version: schema.yjsSnapshots.version, state: schema.yjsSnapshots.state })
        .from(schema.yjsSnapshots)
        .where(eq(schema.yjsSnapshots.mapId, mapId))
        .orderBy(desc(schema.yjsSnapshots.version))
        .limit(1);

      if (!snapRows[0]) continue;

      const { version: snapVersion, state: snapState } = snapRows[0];
      const doc = loadDoc(snapState);

      try {
        const nodes = doc.getMap<Y.Map<unknown>>('nodes');
        const ts = new Date();
        const rollbackBatchId = newId('batch');

        // 按 nodeId 分组，逐节点逆放字段
        const byNode = new Map<string, typeof mapEvents>();
        for (const ev of mapEvents) {
          const list = byNode.get(ev.nodeId) ?? [];
          list.push(ev);
          byNode.set(ev.nodeId, list);
        }

        for (const [nodeId, nodeEvents] of byNode) {
          const node = nodes.get(nodeId);
          if (!node) continue; // 节点可能已被删除

          doc.transact(() => {
            for (const ev of nodeEvents) {
              if (!ev.field) continue;
              const before = ev.before;
              if (before === null || before === undefined) {
                node.delete(ev.field);
              } else {
                node.set(ev.field, before);
              }
            }
          });

          // 为每次逆放生成 ChangeEvent
          for (const ev of nodeEvents) {
            if (!ev.field) continue;
            rollbackEventRows.push({
              id: newId('changeEvent'),
              tenantId,
              projectId: ev.projectId,
              mapId,
              nodeId,
              actorId: ctx.userId,
              op: 'setField',
              field: ev.field,
              before: ev.after, // 回滚：before/after 交换
              after: ev.before,
              batchId: rollbackBatchId,
              pathIds: null,
              ts,
            });
          }
        }

        // 写新快照
        const newState = Buffer.from(Y.encodeStateAsUpdate(doc));
        await this.db.insert(schema.yjsSnapshots).values({
          mapId,
          version: snapVersion + 1,
          state: newState,
        });
      } finally {
        doc.destroy();
      }
    }

    // 写回滚 ChangeEvent
    if (rollbackEventRows.length > 0) {
      await this.db
        .insert(schema.changeEvents)
        .values(rollbackEventRows)
        .onConflictDoNothing({ target: schema.changeEvents.id });
    }

    // 标记 migration 为 rolledback
    await this.db
      .update(schema.schemaMigrations)
      .set({ status: 'rolledback' })
      .where(eq(schema.schemaMigrations.id, migrationId));

    return { migrationId, status: 'rolledback', mode: 'event_replay' };
  }
}
