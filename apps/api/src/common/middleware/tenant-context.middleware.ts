import { Injectable, type NestMiddleware } from '@nestjs/common';
import { tenantStorage } from '../tenant-context';

/**
 * 全局中间件：为每个请求建立可变租户上下文壳，贯穿后续守卫与处理器。
 * 中间件早于守卫执行，run() 回调包裹 next()，故 JwtAuthGuard 与业务代码同处一个 ALS 上下文。
 */
@Injectable()
export class TenantContextMiddleware implements NestMiddleware {
  use(_req: unknown, _res: unknown, next: () => void): void {
    tenantStorage.run({}, next);
  }
}
