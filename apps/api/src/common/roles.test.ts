import { describe, expect, it } from 'vitest';
import type { Role } from '@mindline/shared';
import { ROLE_RANK, hasMinRole } from './roles';

describe('ROLE_RANK', () => {
  it('等级严格递增 viewer<commenter<editor<admin<owner', () => {
    expect(ROLE_RANK.viewer).toBeLessThan(ROLE_RANK.commenter);
    expect(ROLE_RANK.commenter).toBeLessThan(ROLE_RANK.editor);
    expect(ROLE_RANK.editor).toBeLessThan(ROLE_RANK.admin);
    expect(ROLE_RANK.admin).toBeLessThan(ROLE_RANK.owner);
  });
});

describe('hasMinRole', () => {
  const order: Role[] = ['viewer', 'commenter', 'editor', 'admin', 'owner'];

  it('同级满足', () => {
    for (const r of order) {
      expect(hasMinRole(r, r)).toBe(true);
    }
  });

  it('高于门槛满足，低于门槛不满足', () => {
    // 对每个门槛 min，遍历所有角色验证 >= 关系
    for (let mi = 0; mi < order.length; mi++) {
      const min = order[mi]!;
      for (let ri = 0; ri < order.length; ri++) {
        const role = order[ri]!;
        expect(hasMinRole(role, min)).toBe(ri >= mi);
      }
    }
  });

  it('典型用例：高角色达低门槛、低角色不达高门槛', () => {
    expect(hasMinRole('editor', 'commenter')).toBe(true);
    expect(hasMinRole('owner', 'admin')).toBe(true);
    expect(hasMinRole('viewer', 'editor')).toBe(false);
    expect(hasMinRole('commenter', 'owner')).toBe(false);
  });
});
