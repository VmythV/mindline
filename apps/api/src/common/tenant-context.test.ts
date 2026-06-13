import { describe, expect, it } from 'vitest';
import {
  getTenantId,
  getTenantContextOrUndefined,
  tenantStorage,
} from './tenant-context';

describe('租户上下文（AsyncLocalStorage）', () => {
  it('run 内 getTenantId 返回写入的租户 id', () => {
    tenantStorage.run({}, () => {
      const store = tenantStorage.getStore();
      // 模拟 JwtAuthGuard 鉴权后写入
      store!.tenantId = 'ten_a';
      store!.userId = 'usr_a';
      expect(getTenantId()).toBe('ten_a');
      expect(getTenantContextOrUndefined()).toEqual({ tenantId: 'ten_a', userId: 'usr_a' });
    });
  });

  it('未建立上下文时 getTenantId 抛错（防止静默漏 scope）', () => {
    expect(() => getTenantId()).toThrow(/租户上下文缺失/);
    expect(getTenantContextOrUndefined()).toBeUndefined();
  });

  it('上下文已建立但未鉴权（@Public 链路）时 getTenantId 抛错', () => {
    tenantStorage.run({}, () => {
      // store 存在但 tenantId 为空（守卫未写入）
      expect(() => getTenantId()).toThrow(/租户上下文缺失/);
    });
  });

  it('嵌套两个 run 上下文互不串（请求隔离）', () => {
    tenantStorage.run({ tenantId: 'ten_outer' }, () => {
      expect(getTenantId()).toBe('ten_outer');
      tenantStorage.run({ tenantId: 'ten_inner' }, () => {
        expect(getTenantId()).toBe('ten_inner');
      });
      // 退出内层后恢复外层，不被污染
      expect(getTenantId()).toBe('ten_outer');
    });
  });
});
