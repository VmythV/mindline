import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { and, eq } from 'drizzle-orm';
import type { Role } from '@mindline/shared';
import { DRIZZLE } from '../../db/db.module';
import { schema, type Database } from '../../db';
import { MIN_ROLE_KEY } from '../decorators/min-role.decorator';
import { hasMinRole } from '../roles';

/**
 * 项目级权限守卫（在全局 JwtAuthGuard 之后执行）：
 *  - 从路由参数 :id / :projectId 取项目；
 *  - 校验项目属当前租户、当前用户是成员（非成员视为「不可感知」→ 404）；
 *  - 注入 req.projectRole；
 *  - 若标了 @MinRole，校验角色等级是否达标（否则 403）。
 */
@Injectable()
export class ProjectRoleGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    @Inject(DRIZZLE) private readonly db: Database,
  ) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const minRole = this.reflector.get<Role | undefined>(MIN_ROLE_KEY, ctx.getHandler());
    const req = ctx.switchToHttp().getRequest<{
      user: { userId: string; tenantId: string };
      params: Record<string, string | undefined>;
      projectRole?: Role;
    }>();

    const projectId = req.params.id ?? req.params.projectId;
    if (!projectId) throw new NotFoundException('缺少项目标识');

    const proj = await this.db
      .select({ tenantId: schema.projects.tenantId })
      .from(schema.projects)
      .where(eq(schema.projects.id, projectId))
      .limit(1);
    if (proj.length === 0 || proj[0]!.tenantId !== req.user.tenantId) {
      throw new NotFoundException('项目不存在');
    }

    const mem = await this.db
      .select({ role: schema.projectMembers.role })
      .from(schema.projectMembers)
      .where(
        and(
          eq(schema.projectMembers.projectId, projectId),
          eq(schema.projectMembers.userId, req.user.userId),
        ),
      )
      .limit(1);
    if (mem.length === 0) throw new NotFoundException('项目不存在');

    const role = mem[0]!.role as Role;
    req.projectRole = role;

    if (minRole && !hasMinRole(role, minRole)) {
      throw new ForbiddenException('权限不足');
    }
    return true;
  }
}
