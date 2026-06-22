import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { and, eq, inArray } from 'drizzle-orm';
import { newId } from '@mindline/shared';
import { schema, type Database } from '@mindline/db';
import { DRIZZLE } from '../db/db.module';
import { ChangesService } from '../changes/changes.service';
import { CollabWriterService } from '../maps/collab-writer.service';
import type { TransferPreviewDto } from './dto/transfer-preview.dto';

interface Ctx {
  userId: string;
  tenantId: string;
}

@Injectable()
export class TransferService {
  constructor(
    @Inject(DRIZZLE) private readonly db: Database,
    private readonly changes: ChangesService,
    private readonly collabWriter: CollabWriterService,
  ) {}

  /**
   * 权限校验：scope=project 时要求调用者是该项目的 admin 或 owner；
   * scope=tenant/workspace 时只要求是租户用户（生产应按需加强）。
   */
  private async checkPermission(ctx: Ctx, scope: string, scopeId?: string) {
    if (scope === 'project' && scopeId) {
      const rows = await this.db
        .select({ role: schema.projectMembers.role })
        .from(schema.projectMembers)
        .where(
          and(
            eq(schema.projectMembers.projectId, scopeId),
            eq(schema.projectMembers.userId, ctx.userId),
          ),
        )
        .limit(1);
      const role = rows[0]?.role;
      if (!role || (role !== 'admin' && role !== 'owner')) {
        throw new ForbiddenException('需要 admin 或 owner 权限');
      }
    }
    // scope=tenant/workspace：只要是该租户用户即可（生产应加更严格校验）
  }

  async preview(ctx: Ctx, dto: TransferPreviewDto) {
    await this.checkPermission(ctx, dto.scope, dto.scopeId);

    // 验证 from/to 用户存在且属于同一租户
    const users = await this.db
      .select({ id: schema.users.id })
      .from(schema.users)
      .where(
        and(
          inArray(schema.users.id, [dto.fromUserId, dto.toUserId]),
          eq(schema.users.tenantId, ctx.tenantId),
        ),
      );
    if (users.length < 2) throw new BadRequestException('用户不存在或不属于当前租户');

    // 统计 project_members 中 from_user 的席位数
    let memberships: { projectId: string }[];

    if (dto.scope === 'project' && dto.scopeId) {
      memberships = await this.db
        .select({ projectId: schema.projectMembers.projectId })
        .from(schema.projectMembers)
        .where(
          and(
            eq(schema.projectMembers.userId, dto.fromUserId),
            eq(schema.projectMembers.projectId, dto.scopeId),
          ),
        );
    } else {
      memberships = await this.db
        .select({ projectId: schema.projectMembers.projectId })
        .from(schema.projectMembers)
        .where(eq(schema.projectMembers.userId, dto.fromUserId));
    }

    const projectIds = memberships.map((m) => m.projectId);

    // 统计各 project 的 map 内 ownerId===fromUser 的节点数（读落库快照，可能滞后数秒，仅作预估）
    const maps = projectIds.length
      ? await this.db
          .select({ id: schema.maps.id, projectId: schema.maps.projectId })
          .from(schema.maps)
          .where(inArray(schema.maps.projectId, projectIds))
      : [];
    const nodesByProject = new Map<string, number>();
    let totalNodes = 0;
    for (const m of maps) {
      const snap = await this.changes.snapshot(m.id, ctx);
      const count = snap.nodes.filter((n) => n.ownerId === dto.fromUserId).length;
      nodesByProject.set(m.projectId, count);
      totalNodes += count;
    }

    return {
      impact: {
        projects: projectIds.length,
        nodes: totalNodes,
        mentions: 0, // @ 提及替换待 IM 模块（M4）后续
        memberships: projectIds.length,
      },
      details: projectIds.map((p) => ({
        projectId: p,
        nodes: nodesByProject.get(p) ?? 0,
        memberships: 1,
      })),
    };
  }

  async execute(ctx: Ctx, dto: TransferPreviewDto, token: string) {
    await this.checkPermission(ctx, dto.scope, dto.scopeId);

    // 检查是否有进行中的同范围任务（唯一索引 uq_transfer_running）
    const running = await this.db
      .select({ id: schema.transferJobs.id })
      .from(schema.transferJobs)
      .where(
        and(
          eq(schema.transferJobs.tenantId, ctx.tenantId),
          eq(schema.transferJobs.fromUserId, dto.fromUserId),
          eq(schema.transferJobs.scope, dto.scope),
          eq(schema.transferJobs.status, 'running'),
        ),
      )
      .limit(1);
    if (running.length > 0) throw new ConflictException('已有进行中的同范围替换任务');

    // 查目标席位
    let memberRows: { projectId: string; role: string }[];

    if (dto.scope === 'project' && dto.scopeId) {
      memberRows = await this.db
        .select({
          projectId: schema.projectMembers.projectId,
          role: schema.projectMembers.role,
        })
        .from(schema.projectMembers)
        .where(
          and(
            eq(schema.projectMembers.userId, dto.fromUserId),
            eq(schema.projectMembers.projectId, dto.scopeId),
          ),
        );
    } else {
      const allRows = await this.db
        .select({
          projectId: schema.projectMembers.projectId,
          role: schema.projectMembers.role,
        })
        .from(schema.projectMembers)
        .where(eq(schema.projectMembers.userId, dto.fromUserId));

      // 过滤到当前租户的项目（通过 join projects）
      const projectsInTenant = await this.db
        .select({ id: schema.projects.id })
        .from(schema.projects)
        .where(eq(schema.projects.tenantId, ctx.tenantId));
      const tenantProjectIds = new Set(projectsInTenant.map((p) => p.id));
      memberRows = allRows.filter((m) => tenantProjectIds.has(m.projectId));
    }

    const jobId = newId('job');
    await this.db.insert(schema.transferJobs).values({
      id: jobId,
      tenantId: ctx.tenantId,
      fromUserId: dto.fromUserId,
      toUserId: dto.toUserId,
      scope: dto.scope,
      scopeId: dto.scopeId ?? null,
      status: 'running',
      total: memberRows.length,
      processed: 0,
      createdBy: ctx.userId,
    });

    // 同步执行（数据量小；大数据量应改为后台队列）
    let processed = 0;
    const conflicts: Array<{ nodeId: string; reason: string }> = [];

    for (const member of memberRows) {
      const existing = await this.db
        .select({ role: schema.projectMembers.role })
        .from(schema.projectMembers)
        .where(
          and(
            eq(schema.projectMembers.projectId, member.projectId),
            eq(schema.projectMembers.userId, dto.toUserId),
          ),
        )
        .limit(1);

      if (existing.length > 0) {
        conflicts.push({ nodeId: member.projectId, reason: 'to_user 已是该项目成员' });
      } else {
        // 将 from_user 的席位转移给 to_user（更新 userId）
        await this.db
          .update(schema.projectMembers)
          .set({ userId: dto.toUserId })
          .where(
            and(
              eq(schema.projectMembers.projectId, member.projectId),
              eq(schema.projectMembers.userId, dto.fromUserId),
            ),
          );
        processed++;
      }
    }

    // Yjs 侧：对受影响 project 的 map，把 ownerId===fromUser 的节点改挂 toUser（经命令层 setOwner）
    // 单 map 失败（如 collab 不可达）记 conflicts 并继续，不回滚已转席位（可重跑补齐，setOwner 幂等）
    let ownerReplaced = 0;
    const affectedProjectIds = [...new Set(memberRows.map((m) => m.projectId))];
    const maps = affectedProjectIds.length
      ? await this.db
          .select({ id: schema.maps.id })
          .from(schema.maps)
          .where(inArray(schema.maps.projectId, affectedProjectIds))
      : [];
    for (const m of maps) {
      try {
        ownerReplaced += await this.collabWriter.replaceOwner(
          m.id,
          ctx,
          token,
          dto.fromUserId,
          dto.toUserId,
        );
      } catch {
        conflicts.push({ nodeId: m.id, reason: 'owner_replace_failed' });
      }
    }

    await this.db
      .update(schema.transferJobs)
      .set({ status: 'done', processed, conflicts: conflicts.length > 0 ? conflicts : null })
      .where(eq(schema.transferJobs.id, jobId));

    return { jobId, status: 'done', processed, ownerReplaced, total: memberRows.length, conflicts };
  }

  async getJob(jobId: string, ctx: Ctx) {
    const rows = await this.db
      .select()
      .from(schema.transferJobs)
      .where(and(eq(schema.transferJobs.id, jobId), eq(schema.transferJobs.tenantId, ctx.tenantId)))
      .limit(1);
    if (!rows[0]) throw new NotFoundException('任务不存在');
    const job = rows[0];
    return {
      jobId: job.id,
      status: job.status,
      processed: job.processed,
      total: job.total,
      conflicts: (job.conflicts as Array<{ nodeId: string; reason: string }> | null) ?? [],
    };
  }
}
