import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';
import { tenantStorage } from '../tenant-context';

interface AccessPayload {
  sub: string;
  tenantId: string;
  type: 'access' | 'refresh';
}

/** 全局守卫：校验 access JWT 并注入 req.user；@Public() 端点放行。 */
@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly jwt: JwtService,
  ) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      ctx.getHandler(),
      ctx.getClass(),
    ]);
    if (isPublic) return true;

    const req = ctx.switchToHttp().getRequest<{
      headers: Record<string, string | undefined>;
      user?: { userId: string; tenantId: string };
    }>();
    const header = req.headers['authorization'];
    if (!header || !header.startsWith('Bearer ')) {
      throw new UnauthorizedException('缺少访问令牌');
    }
    try {
      const payload = await this.jwt.verifyAsync<AccessPayload>(header.slice(7));
      if (payload.type !== 'access') throw new UnauthorizedException('令牌类型错误');
      req.user = { userId: payload.sub, tenantId: payload.tenantId };
      // 写入租户上下文（中间件已建立的 store），供业务查询经 getTenantId() 取权威 tenantId
      const store = tenantStorage.getStore();
      if (store) {
        store.tenantId = payload.tenantId;
        store.userId = payload.sub;
      }
      return true;
    } catch {
      throw new UnauthorizedException('无效或已过期的访问令牌');
    }
  }
}
