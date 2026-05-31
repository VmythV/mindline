import {
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { and, eq, isNull, or } from 'drizzle-orm';
import { newId, type FieldDef, type NodeTypeDefinition, type Role } from '@mindline/shared';
import { DRIZZLE } from '../db/db.module';
import { schema, type Database } from '@mindline/db';
import { hasMinRole } from '../common/roles';
import type { CreateNodeTypeDto } from './dto/create-node-type.dto';
import type { UpdateNodeTypeDto } from './dto/update-node-type.dto';

function isUniqueViolation(e: unknown): boolean {
  return (
    typeof e === 'object' &&
    e !== null &&
    'code' in e &&
    (e as { code?: string }).code === '23505'
  );
}

/** 破坏性变更：删除既有字段，或改变既有字段的 type（新增字段不算）。 */
function isBreakingChange(oldDef: NodeTypeDefinition, newDef: NodeTypeDefinition): boolean {
  const oldFields: FieldDef[] = oldDef?.fields ?? [];
  const newByKey = new Map((newDef?.fields ?? []).map((f) => [f.key, f]));
  for (const f of oldFields) {
    const n = newByKey.get(f.key);
    if (!n) return true; // 删字段
    if (n.type !== f.type) return true; // 改类型
  }
  return false;
}

@Injectable()
export class NodeTypesService {
  constructor(@Inject(DRIZZLE) private readonly db: Database) {}

  /** 该项目可用类型：项目级(project_id=projectId) + 租户全局(project_id null)。 */
  async list(projectId: string, tenantId: string) {
    const rows = await this.db
      .select({
        id: schema.nodeTypeSchemas.id,
        typeKey: schema.nodeTypeSchemas.typeKey,
        definition: schema.nodeTypeSchemas.definition,
        version: schema.nodeTypeSchemas.version,
        scope: schema.nodeTypeSchemas.projectId,
      })
      .from(schema.nodeTypeSchemas)
      .where(
        and(
          eq(schema.nodeTypeSchemas.tenantId, tenantId),
          or(
            eq(schema.nodeTypeSchemas.projectId, projectId),
            isNull(schema.nodeTypeSchemas.projectId),
          ),
        ),
      );
    return {
      items: rows.map((r) => ({
        id: r.id,
        typeKey: r.typeKey,
        version: r.version,
        scope: r.scope ? 'project' : 'global',
        definition: r.definition,
      })),
    };
  }

  /** 创建项目级类型；同作用域 typeKey 唯一（DB 唯一索引兜底）。 */
  async create(projectId: string, tenantId: string, dto: CreateNodeTypeDto) {
    const id = newId('nodeType');
    try {
      await this.db.insert(schema.nodeTypeSchemas).values({
        id,
        tenantId,
        projectId,
        typeKey: dto.typeKey,
        definition: { ...dto.definition, typeKey: dto.typeKey },
        version: 1,
      });
    } catch (e) {
      if (isUniqueViolation(e)) throw new ConflictException('该类型标识已存在');
      throw e;
    }
    return { id, typeKey: dto.typeKey, version: 1 };
  }

  /**
   * 更新项目级类型：升 version、保存旧版本快照、检测破坏性变更（删/改字段）。
   * 路由无 projectId，故在此反查 schema → projectId 并校验 admin（内置/全局类型不在此修改）。
   */
  async update(schemaId: string, ctx: { userId: string; tenantId: string }, dto: UpdateNodeTypeDto) {
    const rows = await this.db
      .select({
        id: schema.nodeTypeSchemas.id,
        projectId: schema.nodeTypeSchemas.projectId,
        typeKey: schema.nodeTypeSchemas.typeKey,
        definition: schema.nodeTypeSchemas.definition,
        version: schema.nodeTypeSchemas.version,
      })
      .from(schema.nodeTypeSchemas)
      .where(
        and(
          eq(schema.nodeTypeSchemas.id, schemaId),
          eq(schema.nodeTypeSchemas.tenantId, ctx.tenantId),
        ),
      )
      .limit(1);
    const cur = rows[0];
    if (!cur) throw new NotFoundException('类型不存在');
    if (!cur.projectId) throw new ForbiddenException('内置/全局类型暂不支持此接口修改');

    // 角色校验：项目 admin+
    const memb = await this.db
      .select({ role: schema.projectMembers.role })
      .from(schema.projectMembers)
      .where(
        and(
          eq(schema.projectMembers.projectId, cur.projectId),
          eq(schema.projectMembers.userId, ctx.userId),
        ),
      )
      .limit(1);
    const role = memb[0]?.role as Role | undefined;
    if (!role) throw new NotFoundException('类型不存在'); // 非成员 → 不暴露存在性
    if (!hasMinRole(role, 'admin')) throw new ForbiddenException('需要管理员权限');

    // 乐观锁（可选）
    if (dto.version != null && dto.version !== cur.version) {
      throw new ConflictException('版本冲突，请刷新后重试');
    }

    const oldDef = cur.definition as NodeTypeDefinition;
    const newDef = { ...(dto.definition as object), typeKey: cur.typeKey } as NodeTypeDefinition;
    const breaking = isBreakingChange(oldDef, newDef);
    const nextVersion = cur.version + 1;

    await this.db.transaction(async (tx) => {
      // 留存「旧版本」快照以便溯源/回滚
      await tx.insert(schema.nodeTypeSchemaVersions).values({
        id: newId('nodeTypeVersion'),
        schemaId,
        version: cur.version,
        definition: oldDef,
      });
      await tx
        .update(schema.nodeTypeSchemas)
        .set({ definition: newDef, version: nextVersion, updatedAt: new Date() })
        .where(eq(schema.nodeTypeSchemas.id, schemaId));
    });

    return { id: schemaId, version: nextVersion, breaking, suggestMigration: breaking };
  }
}
