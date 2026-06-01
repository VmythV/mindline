import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { and, count, eq, isNull } from 'drizzle-orm';
import { newId, type Role } from '@mindline/shared';
import { DRIZZLE } from '../db/db.module';
import { schema, type Database } from '@mindline/db';
import type { CreateProjectDto } from './dto/create-project.dto';
import type { UpdateProjectDto } from './dto/update-project.dto';
import type { AddMemberDto } from './dto/add-member.dto';

interface Ctx {
  userId: string;
  tenantId: string;
}

@Injectable()
export class ProjectsService {
  constructor(@Inject(DRIZZLE) private readonly db: Database) {}

  /** 新建项目：建 project + owner 成员 + 绑定 map（1:1），单事务。 */
  async create(ctx: Ctx, dto: CreateProjectDto) {
    if (dto.parentId) {
      const parent = await this.db
        .select({ tenantId: schema.projects.tenantId })
        .from(schema.projects)
        .where(eq(schema.projects.id, dto.parentId))
        .limit(1);
      if (parent.length === 0 || parent[0]!.tenantId !== ctx.tenantId) {
        throw new BadRequestException('父项目不存在');
      }
    }

    const projectId = newId('project');
    const mapId = newId('map');
    await this.db.transaction(async (tx) => {
      await tx.insert(schema.projects).values({
        id: projectId,
        tenantId: ctx.tenantId,
        name: dto.name,
        parentId: dto.parentId ?? null,
        inheritMembers: dto.inheritMembers ?? true,
        createdBy: ctx.userId,
      });
      await tx.insert(schema.projectMembers).values({
        projectId,
        userId: ctx.userId,
        role: 'owner',
      });
      await tx.insert(schema.maps).values({ id: mapId, tenantId: ctx.tenantId, projectId });
    });

    return { id: projectId, name: dto.name, parentId: dto.parentId ?? null, mapId };
  }

  /** 列出当前用户可见（已加入）的项目；parentId 为空返回顶层。 */
  async list(ctx: Ctx, parentId?: string) {
    const rows = await this.db
      .select({
        id: schema.projects.id,
        name: schema.projects.name,
        parentId: schema.projects.parentId,
        archived: schema.projects.archived,
        mapId: schema.maps.id,
      })
      .from(schema.projects)
      .innerJoin(
        schema.projectMembers,
        and(
          eq(schema.projectMembers.projectId, schema.projects.id),
          eq(schema.projectMembers.userId, ctx.userId),
        ),
      )
      .leftJoin(schema.maps, eq(schema.maps.projectId, schema.projects.id))
      .where(
        and(
          eq(schema.projects.tenantId, ctx.tenantId),
          parentId ? eq(schema.projects.parentId, parentId) : isNull(schema.projects.parentId),
        ),
      );
    return { items: rows, nextCursor: null };
  }

  async get(id: string, tenantId: string, myRole: Role) {
    const rows = await this.db
      .select({
        id: schema.projects.id,
        name: schema.projects.name,
        parentId: schema.projects.parentId,
        archived: schema.projects.archived,
        inheritMembers: schema.projects.inheritMembers,
        mapId: schema.maps.id,
      })
      .from(schema.projects)
      .leftJoin(schema.maps, eq(schema.maps.projectId, schema.projects.id))
      // 约定④：逐查询强制 tenant scope（ProjectRoleGuard 之外的纵深防御）
      .where(and(eq(schema.projects.id, id), eq(schema.projects.tenantId, tenantId)))
      .limit(1);
    const p = rows[0];
    if (!p) throw new NotFoundException('项目不存在');
    const c = await this.db
      .select({ n: count() })
      .from(schema.projectMembers)
      .where(eq(schema.projectMembers.projectId, id));
    return { ...p, myRole, memberCount: Number(c[0]?.n ?? 0) };
  }

  async update(id: string, dto: UpdateProjectDto, tenantId: string, myRole: Role) {
    const patch: Partial<typeof schema.projects.$inferInsert> = {};
    if (dto.name !== undefined) patch.name = dto.name;
    if (dto.archived !== undefined) patch.archived = dto.archived;
    if (dto.inheritMembers !== undefined) patch.inheritMembers = dto.inheritMembers;
    if (Object.keys(patch).length > 0) {
      await this.db
        .update(schema.projects)
        .set(patch)
        .where(and(eq(schema.projects.id, id), eq(schema.projects.tenantId, tenantId)));
    }
    return this.get(id, tenantId, myRole);
  }

  async remove(id: string, tenantId: string) {
    await this.db
      .delete(schema.projects)
      .where(and(eq(schema.projects.id, id), eq(schema.projects.tenantId, tenantId)));
  }

  async listMembers(projectId: string) {
    const rows = await this.db
      .select({
        userId: schema.projectMembers.userId,
        role: schema.projectMembers.role,
        inherited: schema.projectMembers.inherited,
        displayName: schema.users.displayName,
        avatarUrl: schema.users.avatarUrl,
      })
      .from(schema.projectMembers)
      .innerJoin(schema.users, eq(schema.users.id, schema.projectMembers.userId))
      .where(eq(schema.projectMembers.projectId, projectId));
    return { items: rows };
  }

  async addMember(projectId: string, tenantId: string, dto: AddMemberDto) {
    const target = await this.db
      .select({ id: schema.users.id })
      .from(schema.users)
      .where(and(eq(schema.users.id, dto.userId), eq(schema.users.tenantId, tenantId)))
      .limit(1);
    if (target.length === 0) throw new NotFoundException('用户不存在');

    const exist = await this.db
      .select({ userId: schema.projectMembers.userId })
      .from(schema.projectMembers)
      .where(
        and(
          eq(schema.projectMembers.projectId, projectId),
          eq(schema.projectMembers.userId, dto.userId),
        ),
      )
      .limit(1);
    if (exist.length > 0) throw new ConflictException('成员已存在');

    await this.db
      .insert(schema.projectMembers)
      .values({ projectId, userId: dto.userId, role: dto.role });
    return { userId: dto.userId, role: dto.role };
  }

  async updateMember(projectId: string, userId: string, role: Role) {
    const r = await this.db
      .update(schema.projectMembers)
      .set({ role })
      .where(
        and(
          eq(schema.projectMembers.projectId, projectId),
          eq(schema.projectMembers.userId, userId),
        ),
      )
      .returning({ userId: schema.projectMembers.userId });
    if (r.length === 0) throw new NotFoundException('成员不存在');
    return { userId, role };
  }

  async removeMember(projectId: string, userId: string) {
    await this.db
      .delete(schema.projectMembers)
      .where(
        and(
          eq(schema.projectMembers.projectId, projectId),
          eq(schema.projectMembers.userId, userId),
        ),
      );
  }
}
