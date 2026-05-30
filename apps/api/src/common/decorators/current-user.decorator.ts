import { createParamDecorator, type ExecutionContext } from '@nestjs/common';

/** 鉴权后注入到 request 的当前用户上下文（由 JwtAuthGuard 填充）。 */
export interface AuthUser {
  userId: string;
  tenantId: string;
}

export const CurrentUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): AuthUser => {
    const req = ctx.switchToHttp().getRequest<{ user: AuthUser }>();
    return req.user;
  },
);
