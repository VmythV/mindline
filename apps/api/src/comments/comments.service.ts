import { ForbiddenException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { and, eq } from 'drizzle-orm';
import { newId } from '@mindline/shared';
import { schema, type Database } from '@mindline/db';
import { DRIZZLE } from '../db/db.module';
import { ChangesService } from '../changes/changes.service';
import { hasMinRole } from '../common/roles';
import type { Role } from '@mindline/shared';
import type { CreateCommentDto } from './dto/create-comment.dto';
import type { UpdateCommentDto } from './dto/update-comment.dto';

interface Ctx {
  userId: string;
  tenantId: string;
}

@Injectable()
export class CommentsService {
  constructor(
    @Inject(DRIZZLE) private readonly db: Database,
    private readonly changes: ChangesService,
  ) {}

  async list(mapId: string, nodeId: string, tenantId: string) {
    const rows = await this.db
      .select({
        id: schema.comments.id,
        body: schema.comments.body,
        mentions: schema.comments.mentions,
        resolved: schema.comments.resolved,
        createdAt: schema.comments.createdAt,
        updatedAt: schema.comments.updatedAt,
        authorId: schema.comments.authorId,
        displayName: schema.users.displayName,
        avatarUrl: schema.users.avatarUrl,
      })
      .from(schema.comments)
      .innerJoin(schema.users, eq(schema.users.id, schema.comments.authorId))
      .where(
        and(
          eq(schema.comments.tenantId, tenantId),
          eq(schema.comments.mapId, mapId),
          eq(schema.comments.nodeId, nodeId),
        ),
      )
      .orderBy(schema.comments.createdAt);
    return { items: rows };
  }

  async create(mapId: string, nodeId: string, ctx: Ctx, dto: CreateCommentDto) {
    const { projectId, role } = await this.changes.resolveMapAccess(mapId, ctx);
    if (!hasMinRole(role, 'commenter')) throw new ForbiddenException('需要 commenter 以上权限');
    const id = newId('comment');
    await this.db.insert(schema.comments).values({
      id,
      tenantId: ctx.tenantId,
      projectId,
      mapId,
      nodeId,
      authorId: ctx.userId,
      body: dto.body,
      mentions: dto.mentions ?? null,
    });
    return { id, body: dto.body, mentions: dto.mentions ?? null, resolved: false };
  }

  async update(id: string, ctx: Ctx, dto: UpdateCommentDto) {
    const rows = await this.db
      .select({
        authorId: schema.comments.authorId,
        tenantId: schema.comments.tenantId,
        projectId: schema.comments.projectId,
      })
      .from(schema.comments)
      .where(and(eq(schema.comments.id, id), eq(schema.comments.tenantId, ctx.tenantId)))
      .limit(1);
    if (!rows[0]) throw new NotFoundException('评论不存在');
    const comment = rows[0];

    if (comment.authorId !== ctx.userId) {
      const memberRows = await this.db
        .select({ role: schema.projectMembers.role })
        .from(schema.projectMembers)
        .where(
          and(
            eq(schema.projectMembers.projectId, comment.projectId),
            eq(schema.projectMembers.userId, ctx.userId),
          ),
        )
        .limit(1);
      const role = memberRows[0]?.role as Role | undefined;
      if (!role || !hasMinRole(role, 'admin')) throw new ForbiddenException('只能编辑自己的评论');
      if (dto.body !== undefined) throw new ForbiddenException('只有作者可以修改内容');
    }

    const patch: Record<string, unknown> = { updatedAt: new Date() };
    if (dto.body !== undefined) patch['body'] = dto.body;
    if (dto.resolved !== undefined) patch['resolved'] = dto.resolved;
    await this.db.update(schema.comments).set(patch).where(eq(schema.comments.id, id));
    return { id, ...patch };
  }

  async remove(id: string, ctx: Ctx) {
    const rows = await this.db
      .select({
        authorId: schema.comments.authorId,
        projectId: schema.comments.projectId,
      })
      .from(schema.comments)
      .where(and(eq(schema.comments.id, id), eq(schema.comments.tenantId, ctx.tenantId)))
      .limit(1);
    if (!rows[0]) throw new NotFoundException('评论不存在');
    const comment = rows[0];

    if (comment.authorId !== ctx.userId) {
      const memberRows = await this.db
        .select({ role: schema.projectMembers.role })
        .from(schema.projectMembers)
        .where(
          and(
            eq(schema.projectMembers.projectId, comment.projectId),
            eq(schema.projectMembers.userId, ctx.userId),
          ),
        )
        .limit(1);
      const role = memberRows[0]?.role as Role | undefined;
      if (!role || !hasMinRole(role, 'admin')) throw new ForbiddenException('只能删除自己的评论');
    }

    await this.db.delete(schema.comments).where(eq(schema.comments.id, id));
  }
}
