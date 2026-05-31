import jwt from 'jsonwebtoken';
import { and, eq } from 'drizzle-orm';
import { db, schema } from '@mindline/db';

const JWT_SECRET = process.env.JWT_SECRET ?? 'dev-only-change-me';

interface AccessPayload {
  sub: string;
  tenantId: string;
  type: string;
}

/** 校验 access JWT，返回用户上下文；非 access / 无效则抛错。 */
export function verifyAccessToken(token: string): { userId: string; tenantId: string } {
  const payload = jwt.verify(token, JWT_SECRET) as AccessPayload;
  if (payload.type !== 'access') throw new Error('invalid token type');
  return { userId: payload.sub, tenantId: payload.tenantId };
}

/**
 * 解析用户在某 map 的角色（map → project → project_members）。
 * map 不存在 / 跨租户 / 非成员 → 返回 null。
 */
export async function resolveMapRole(
  mapId: string,
  userId: string,
  tenantId: string,
): Promise<string | null> {
  const rows = await db
    .select({
      mapTenant: schema.maps.tenantId,
      role: schema.projectMembers.role,
    })
    .from(schema.maps)
    .innerJoin(schema.projects, eq(schema.projects.id, schema.maps.projectId))
    .leftJoin(
      schema.projectMembers,
      and(
        eq(schema.projectMembers.projectId, schema.projects.id),
        eq(schema.projectMembers.userId, userId),
      ),
    )
    .where(eq(schema.maps.id, mapId))
    .limit(1);
  const row = rows[0];
  if (!row || row.mapTenant !== tenantId) return null;
  return row.role ?? null;
}
