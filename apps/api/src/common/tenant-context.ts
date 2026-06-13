import { AsyncLocalStorage } from 'node:async_hooks';

/** 请求级租户上下文内容（可变：中间件建立空壳，鉴权守卫填充）。 */
export interface TenantStore {
  tenantId?: string;
  userId?: string;
}

/**
 * 全局租户上下文（AsyncLocalStorage）。
 * 生命周期：TenantContextMiddleware 用 run() 建立空壳 → JwtAuthGuard 写入 → 业务查询读取。
 */
export const tenantStorage = new AsyncLocalStorage<TenantStore>();

/**
 * 取当前请求的租户 id；未建立上下文或未通过鉴权（如 @Public 链路误调）时抛错，
 * 避免业务查询静默漏掉 tenant scope。需要强制隔离的查询应以此为权威来源。
 */
export function getTenantId(): string {
  const tenantId = tenantStorage.getStore()?.tenantId;
  if (!tenantId) {
    throw new Error('租户上下文缺失：当前请求未建立上下文或未通过鉴权');
  }
  return tenantId;
}

/** 读取完整租户上下文（可能为 undefined / 字段空）；用于不强制存在的场景。 */
export function getTenantContextOrUndefined(): TenantStore | undefined {
  return tenantStorage.getStore();
}
