import type { Role } from '@mindline/shared';

/** 角色等级（权限与过滤详设 §2）：owner > admin > editor > commenter > viewer。 */
export const ROLE_RANK: Record<Role, number> = {
  viewer: 1,
  commenter: 2,
  editor: 3,
  admin: 4,
  owner: 5,
};

export function hasMinRole(role: Role, min: Role): boolean {
  return ROLE_RANK[role] >= ROLE_RANK[min];
}
