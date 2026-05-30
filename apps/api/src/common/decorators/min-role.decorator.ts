import { SetMetadata } from '@nestjs/common';
import type { Role } from '@mindline/shared';

/** 标记路由所需的最低项目角色，配合 ProjectRoleGuard 使用。 */
export const MIN_ROLE_KEY = 'minRole';
export const MinRole = (role: Role) => SetMetadata(MIN_ROLE_KEY, role);
