import { ConflictException, Inject, Injectable } from '@nestjs/common';
import { and, eq, isNull, or } from 'drizzle-orm';
import { newId } from '@mindline/shared';
import { DRIZZLE } from '../db/db.module';
import { schema, type Database } from '../db';
import type { CreateNodeTypeDto } from './dto/create-node-type.dto';

function isUniqueViolation(e: unknown): boolean {
  return (
    typeof e === 'object' &&
    e !== null &&
    'code' in e &&
    (e as { code?: string }).code === '23505'
  );
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
}
