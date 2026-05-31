import { ForbiddenException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { and, desc, eq } from 'drizzle-orm';
import { newId, type Role } from '@mindline/shared';
import { schema, type Database } from '@mindline/db';
import { DRIZZLE } from '../db/db.module';
import { hasMinRole } from '../common/roles';
import type { AppendChangesDto } from './dto/append-changes.dto';

interface Ctx {
  userId: string;
  tenantId: string;
}

@Injectable()
export class ChangesService {
  constructor(@Inject(DRIZZLE) private readonly db: Database) {}

  /** 校验当前用户对 map 的访问：返回 projectId + 角色；map 不存在/跨租户/非成员 → 404。 */
  private async resolveMapAccess(mapId: string, ctx: Ctx) {
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
      id: newId('changeEvent'),
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
      ts: new Date(e.ts),
    }));
    await this.db.insert(schema.changeEvents).values(rows);
    return { accepted: rows.length };
  }

  /** 时间轴/历史查询（M0 基础版：按 map 倒序；过滤与游标分页 M1 完善）。 */
  async list(mapId: string, ctx: Ctx, limit = 100) {
    await this.resolveMapAccess(mapId, ctx); // 成员即可（Viewer+）
    const rows = await this.db
      .select()
      .from(schema.changeEvents)
      .where(eq(schema.changeEvents.mapId, mapId))
      .orderBy(desc(schema.changeEvents.ts))
      .limit(Math.min(limit, 200));
    return {
      items: rows.map((r) => ({
        id: r.id,
        nodeId: r.nodeId,
        actorId: r.actorId,
        op: r.op,
        field: r.field,
        before: r.before,
        after: r.after,
        batchId: r.batchId,
        ts: r.ts.getTime(),
      })),
      nextCursor: null,
    };
  }
}
