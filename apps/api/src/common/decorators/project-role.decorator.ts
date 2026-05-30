import { createParamDecorator, type ExecutionContext } from '@nestjs/common';
import type { Role } from '@mindline/shared';

/** 注入当前用户在该项目的角色（由 ProjectRoleGuard 填充）。 */
export const ProjectRole = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): Role => {
    const req = ctx.switchToHttp().getRequest<{ projectRole: Role }>();
    return req.projectRole;
  },
);
