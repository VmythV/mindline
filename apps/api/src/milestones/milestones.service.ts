import { ForbiddenException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { and, desc, eq, gte, lte } from 'drizzle-orm';
import { newId, type Role, type MilestoneSuggestResponse } from '@mindline/shared';
import { schema, type Database } from '@mindline/db';
import { DRIZZLE } from '../db/db.module';
import { hasMinRole } from '../common/roles';
import { ProvidersService } from '../ai/providers.service';
import { callGatewayText } from '../ai/gateway';
import type { AiSuggestDto, CreateMilestoneDto, UpdateMilestoneDto } from './milestones.dto';

interface Ctx {
  userId: string;
  tenantId: string;
}

function toView(r: typeof schema.milestones.$inferSelect) {
  return {
    id: r.id,
    projectId: r.projectId,
    nodeId: r.nodeId,
    title: r.title,
    description: r.description,
    aiSummary: r.aiSummary,
    rangeStart: r.rangeStart ? r.rangeStart.getTime() : null,
    rangeEnd: r.rangeEnd ? r.rangeEnd.getTime() : null,
    createdBy: r.createdBy,
    createdAt: r.createdAt.getTime(),
  };
}

@Injectable()
export class MilestonesService {
  constructor(
    @Inject(DRIZZLE) private readonly db: Database,
    private readonly providers: ProvidersService, // 复用凭证路由 + 计量
  ) {}

  async list(projectId: string, ctx: Ctx) {
    const rows = await this.db
      .select()
      .from(schema.milestones)
      .where(
        and(
          eq(schema.milestones.projectId, projectId),
          eq(schema.milestones.tenantId, ctx.tenantId),
        ),
      )
      .orderBy(desc(schema.milestones.createdAt));
    return { items: rows.map(toView) };
  }

  async create(projectId: string, ctx: Ctx, dto: CreateMilestoneDto) {
    const id = newId('milestone');
    await this.db.insert(schema.milestones).values({
      id,
      tenantId: ctx.tenantId,
      projectId,
      nodeId: dto.nodeId ?? null,
      title: dto.title,
      description: dto.description ?? null,
      aiSummary: null,
      rangeStart: dto.range?.start ? new Date(dto.range.start) : null,
      rangeEnd: dto.range?.end ? new Date(dto.range.end) : null,
      createdBy: ctx.userId,
    });
    return { id, title: dto.title, createdBy: ctx.userId };
  }

  /** PATCH/DELETE 路由无 projectId → 反查里程碑所属项目并校验成员 editor+。 */
  private async assertEditable(id: string, ctx: Ctx) {
    const rows = await this.db
      .select({ projectId: schema.milestones.projectId, tenantId: schema.milestones.tenantId })
      .from(schema.milestones)
      .where(eq(schema.milestones.id, id))
      .limit(1);
    const m = rows[0];
    if (!m || m.tenantId !== ctx.tenantId) throw new NotFoundException('里程碑不存在');
    const memb = await this.db
      .select({ role: schema.projectMembers.role })
      .from(schema.projectMembers)
      .where(
        and(
          eq(schema.projectMembers.projectId, m.projectId),
          eq(schema.projectMembers.userId, ctx.userId),
        ),
      )
      .limit(1);
    const role = memb[0]?.role as Role | undefined;
    if (!role) throw new NotFoundException('里程碑不存在'); // 非成员不暴露存在性
    if (!hasMinRole(role, 'editor')) throw new ForbiddenException('需要编辑权限');
  }

  async update(id: string, ctx: Ctx, dto: UpdateMilestoneDto) {
    await this.assertEditable(id, ctx);
    const set: Partial<typeof schema.milestones.$inferInsert> = {};
    if (dto.title !== undefined) set.title = dto.title;
    if (dto.description !== undefined) set.description = dto.description;
    if (dto.aiSummary !== undefined) set.aiSummary = dto.aiSummary;
    if (dto.range !== undefined) {
      set.rangeStart = dto.range.start ? new Date(dto.range.start) : null;
      set.rangeEnd = dto.range.end ? new Date(dto.range.end) : null;
    }
    await this.db.update(schema.milestones).set(set).where(eq(schema.milestones.id, id));
    return { id };
  }

  async remove(id: string, ctx: Ctx) {
    await this.assertEditable(id, ctx);
    await this.db.delete(schema.milestones).where(eq(schema.milestones.id, id));
  }

  /** AI 建议：扫描区间内 change_events 聚合 → LLM 生成建议 + 摘要初稿（建议态，不入表）。 */
  async aiSuggest(projectId: string, ctx: Ctx, dto: AiSuggestDto): Promise<MilestoneSuggestResponse> {
    const from = new Date(dto.range.from);
    const to = new Date(dto.range.to);
    const events = await this.db
      .select({
        nodeId: schema.changeEvents.nodeId,
        op: schema.changeEvents.op,
        actorName: schema.users.displayName,
      })
      .from(schema.changeEvents)
      .leftJoin(schema.users, eq(schema.users.id, schema.changeEvents.actorId))
      .where(
        and(
          eq(schema.changeEvents.projectId, projectId),
          eq(schema.changeEvents.tenantId, ctx.tenantId),
          gte(schema.changeEvents.ts, from),
          lte(schema.changeEvents.ts, to),
        ),
      )
      .limit(500);

    const byNode = new Map<string, number>();
    const byOp = new Map<string, number>();
    const actors = new Set<string>();
    for (const e of events) {
      byNode.set(e.nodeId, (byNode.get(e.nodeId) ?? 0) + 1);
      byOp.set(e.op, (byOp.get(e.op) ?? 0) + 1);
      if (e.actorName) actors.add(e.actorName);
    }
    const topNodes = [...byNode.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8);
    const opDist = [...byOp.entries()].map(([k, v]) => `${k}:${v}`).join(', ');
    const stat = `区间内共 ${events.length} 条变更，${actors.size} 人参与（${[...actors].slice(0, 5).join('、')}）。操作分布：${opDist || '无'}。`;
    const topText = topNodes.map(([id, c]) => `- ${id}（${c} 次变更）`).join('\n') || '（无）';

    const system =
      '你是项目里程碑助手。根据给定区间的变更统计，建议里程碑并生成阶段摘要。只输出 JSON：{"suggestions":[{"title":string,"reason":string,"anchorNodeId":string|null}],"summaryDraft":string}。suggestions 最多 3 条，title 精炼，reason 说明该时段发生了什么，anchorNodeId 取高频节点 id 或 null。';
    const user = `# 区间变更统计\n${stat}\n# 高频节点\n${topText}`;

    const resolved = await this.providers.getActiveConfig(ctx.tenantId);
    const creds = resolved
      ? { url: resolved.endpoint, key: resolved.apiKey, model: resolved.model, provider: resolved.provider }
      : undefined;
    const stub: MilestoneSuggestResponse = {
      suggestions: events.length
        ? [
            {
              title: '阶段进展',
              reason: `该时段共 ${events.length} 条变更，${actors.size} 人参与`,
              anchorNodeId: topNodes[0]?.[0] ?? null,
            },
          ]
        : [],
      summaryDraft: `本区间共 ${events.length} 条变更，${actors.size} 人参与（示例摘要；配置真实 AI 网关后为模型生成）。`,
    };
    const result = await callGatewayText({ system, user, stubText: JSON.stringify(stub), creds });

    let parsed: MilestoneSuggestResponse = { suggestions: [], summaryDraft: result.text };
    try {
      const m = result.text.match(/\{[\s\S]*\}/);
      if (m) {
        const j = JSON.parse(m[0]) as Partial<MilestoneSuggestResponse>;
        parsed = { suggestions: j.suggestions ?? [], summaryDraft: j.summaryDraft ?? '' };
      }
    } catch {
      /* 解析失败 → 保留原文为摘要 */
    }

    try {
      await this.providers.record({
        tenantId: ctx.tenantId,
        projectId,
        userId: ctx.userId,
        capability: 'summarize',
        provider: result.modelMeta.provider,
        model: result.modelMeta.model,
        tokensIn: result.modelMeta.tokens.in,
        tokensOut: result.modelMeta.tokens.out,
      });
    } catch {
      /* 计量失败忽略 */
    }

    return parsed;
  }
}
