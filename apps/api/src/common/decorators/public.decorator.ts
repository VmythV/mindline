import { SetMetadata } from '@nestjs/common';

/** 标记端点为公开（免 JWT 鉴权），如登录/注册/刷新。 */
export const IS_PUBLIC_KEY = 'isPublic';
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);
