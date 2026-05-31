import { ForbiddenException, Inject, Injectable } from '@nestjs/common';
import { and, eq, isNull, or } from 'drizzle-orm';
import { newId, type NodeTypeDefinition } from '@mindline/shared';
import { schema, type Database } from '@mindline/db';
import { DRIZZLE } from '../db/db.module';
import { hasMinRole } from '../common/roles';
import { ChangesService } from '../changes/changes.service';
import { buildContext } from './context-builder';
import { buildSystemPrompt, buildUserPrompt, EMIT_SUBTREE_FUNCTION } from './prompt';
import { callGateway } from './gateway';
import { buildProposal } from './validate';
import type { DecomposeDto } from './dto/decompose.dto';

interface Ctx {
  userId: string;
  tenantId: string;
}

type Emit = (event: string, data: unknown) => void;

@Injectable()
export class AiService {
  constructor(
    @Inject(DRIZZLE) private readonly db: Database,
    private readonly changes: ChangesService,
  ) {}

  /** 鉴权前置（SSE 头写出前调用）：需 project role ≥ editor，返回 projectId。 */
  async assertEditor(mapId: string, ctx: Ctx): Promise<{ projectId: string }> {
    const { projectId, role } = await this.changes.resolveMapAccess(mapId, ctx);
    if (!hasMinRole(role, 'editor')) throw new ForbiddenException('需要编辑权限');
    return { projectId };
  }

  /** 取目标类型 Schema（项目级优先于租户全局）。 */
  private async loadSchema(
    tenantId: string,
    projectId: string,
    typeKey: string,
  ): Promise<NodeTypeDefinition | null> {
    const rows = await this.db
      .select({
        definition: schema.nodeTypeSchemas.definition,
        projectId: schema.nodeTypeSchemas.projectId,
      })
      .from(schema.nodeTypeSchemas)
      .where(
        and(
          eq(schema.nodeTypeSchemas.tenantId, tenantId),
          eq(schema.nodeTypeSchemas.typeKey, typeKey),
          or(eq(schema.nodeTypeSchemas.projectId, projectId), isNull(schema.nodeTypeSchemas.projectId)),
        ),
      );
    if (!rows.length) return null;
    const preferred = rows.find((r) => r.projectId === projectId) ?? rows[0]!;
    return preferred.definition as NodeTypeDefinition;
  }

  /**
   * 拆解编排：组装上下文 → 调网关（协议失败重试1次）→ 校验规整 → 经 SSE 推 meta、op、done。
   * 异常由 controller 捕获转 error 事件。
   */
  async decompose(dto: DecomposeDto, ctx: Ctx, projectId: string, emit: Emit, signal: AbortSignal) {
    const snap = await this.changes.snapshot(dto.mapId, ctx);
    const ctxObj = buildContext(snap.nodes, dto.nodeId, dto.targetType || 'idea');
    const targetType = dto.targetType || ctxObj.parentType || ctxObj.target.type || 'idea';
    const targetSchema = await this.loadSchema(ctx.tenantId, projectId, targetType);

    const maxChildren = dto.maxChildren ?? 8;
    const lang = dto.lang || 'zh';
    const system = buildSystemPrompt(maxChildren, lang);
    const user = buildUserPrompt(ctxObj, targetSchema, dto.prompt);

    const proposalId = newId('aiProposal');
    const batchId = newId('batch');
    const hasGateway = !!process.env.AI_GATEWAY_URL;
    const provider = hasGateway ? process.env.AI_GATEWAY_PROVIDER || 'openai' : 'stub';
    const model = hasGateway ? process.env.AI_GATEWAY_MODEL || 'gpt-4o-mini' : 'stub';
    emit('meta', { proposalId, batchId, provider, model });

    const stubTitles = Array.from({ length: Math.min(maxChildren, 4) }, (_, i) =>
      `${ctxObj.target.title} · 方向 ${i + 1}`,
    );
    const gw = { system, user, functionDef: EMIT_SUBTREE_FUNCTION as unknown as Record<string, unknown>, signal, stubTitles };

    let result = await callGateway(gw);
    if (!result.nodes.length) {
      // 协议级失败 → 重试 1 次（追加“必须用函数返回”提示）
      result = await callGateway({ ...gw, retryHint: true });
    }

    const proposal = buildProposal({
      rawNodes: result.nodes,
      schema: targetSchema,
      targetType,
      anchorNodeId: dto.nodeId,
      mapId: dto.mapId,
      proposalId,
      batchId,
      maxChildren,
      existingChildTitles: ctxObj.children.map((c) => c.title),
      modelMeta: result.modelMeta,
    });

    for (const op of proposal.ops) emit('op', op);

    const valid = proposal.ops.filter((o) => o.valid).length;
    emit('done', {
      proposalId,
      stats: {
        total: proposal.ops.length,
        valid,
        invalid: proposal.ops.length - valid,
        tokens: result.modelMeta.tokens,
      },
    });
  }
}
