import { ForbiddenException, Inject, Injectable } from '@nestjs/common';
import { and, eq, isNull, or } from 'drizzle-orm';
import { newId, type NodeSnapshot, type NodeTypeDefinition } from '@mindline/shared';
import { schema, type Database } from '@mindline/db';
import { DRIZZLE } from '../db/db.module';
import { hasMinRole } from '../common/roles';
import { ChangesService } from '../changes/changes.service';
import { ProvidersService } from './providers.service';
import { buildContext } from './context-builder';
import { buildSystemPrompt, buildUserPrompt, EMIT_SUBTREE_FUNCTION } from './prompt';
import { callGateway, callGatewayText } from './gateway';
import { buildProposal } from './validate';
import type { DecomposeDto } from './dto/decompose.dto';
import type { SummarizeDto } from './dto/summarize.dto';
import type { ConverseDto } from './dto/converse.dto';
import type { CompleteDto } from './dto/complete.dto';
import type { RewriteDto } from './dto/rewrite.dto';

interface Ctx {
  userId: string;
  tenantId: string;
}

type Emit = (event: string, data: unknown) => void;

/** 把摘要文本切成小块，模拟逐段流式（最小闭环；模型级 token 流式后续）。 */
function splitForStream(text: string): string[] {
  if (!text) return [];
  return text.match(/[^。！？.!?\n]+[。！？.!?\n]?/g) ?? [text];
}

@Injectable()
export class AiService {
  constructor(
    @Inject(DRIZZLE) private readonly db: Database,
    private readonly changes: ChangesService,
    private readonly providers: ProvidersService,
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
    // 租户凭证路由：取启用配置（默认优先）→ 解密；无则回退 env，再无则 stub
    const resolved = await this.providers.getActiveConfig(ctx.tenantId);
    const creds = resolved
      ? { url: resolved.endpoint, key: resolved.apiKey, model: resolved.model, provider: resolved.provider }
      : undefined;
    const hasGateway = !!(creds?.url || process.env.AI_GATEWAY_URL);
    const provider = hasGateway ? creds?.provider || process.env.AI_GATEWAY_PROVIDER || 'openai' : 'stub';
    const model = hasGateway ? creds?.model || process.env.AI_GATEWAY_MODEL || 'gpt-4o-mini' : 'stub';
    emit('meta', { proposalId, batchId, provider, model });

    const stubTitles = Array.from({ length: Math.min(maxChildren, 4) }, (_, i) =>
      `${ctxObj.target.title} · 方向 ${i + 1}`,
    );
    const gw = {
      system,
      user,
      functionDef: EMIT_SUBTREE_FUNCTION as unknown as Record<string, unknown>,
      signal,
      stubTitles,
      creds,
    };

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

    // 计量落库（失败不阻断主流程）
    try {
      await this.providers.record({
        tenantId: ctx.tenantId,
        projectId,
        userId: ctx.userId,
        capability: 'decompose',
        provider: result.modelMeta.provider,
        model: result.modelMeta.model,
        tokensIn: result.modelMeta.tokens.in,
        tokensOut: result.modelMeta.tokens.out,
      });
    } catch {
      /* 计量失败忽略 */
    }
  }

  /** 收集 nodeId 子树的标题+正文为纯文本（供摘要）。 */
  private collectSubtree(nodes: NodeSnapshot[], rootId: string) {
    const childrenOf = new Map<string, NodeSnapshot[]>();
    for (const n of nodes) {
      const key = n.parentId ?? '';
      const arr = childrenOf.get(key) ?? [];
      arr.push(n);
      childrenOf.set(key, arr);
    }
    const root = nodes.find((n) => n.id === rootId);
    const byId = new Map(nodes.map((n) => [n.id, n]));
    const strip = (html: unknown) =>
      typeof html === 'string' ? html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim() : '';
    const lines: string[] = [];
    let count = 0;
    const seen = new Set<string>();
    const walk = (id: string, depth: number) => {
      if (seen.has(id)) return;
      seen.add(id);
      const n = byId.get(id);
      if (!n) return;
      const desc = strip(n.data?.desc);
      lines.push(`${'  '.repeat(depth)}- ${n.title}${desc ? '：' + desc.slice(0, 200) : ''}`);
      count++;
      for (const c of childrenOf.get(id) ?? []) walk(c.id, depth + 1);
    };
    walk(rootId, 0);
    return { title: root?.title ?? '当前节点', text: lines.join('\n'), count };
  }

  /** 摘要（SSE）：组装子树文本 → 网关纯文本补全 → 分块 delta 推送 → 计量。 */
  async summarize(dto: SummarizeDto, ctx: Ctx, projectId: string, emit: Emit, signal: AbortSignal) {
    const snap = await this.changes.snapshot(dto.mapId, ctx);
    const sub = this.collectSubtree(snap.nodes, dto.nodeId);
    const lang = dto.lang || 'zh';
    const system = `你是摘要助手。请用${lang}为给定的思维导图子树生成简洁、结构化的摘要初稿（3-6 句），提炼要点与关系，供用户编辑，不要逐条复述。`;
    const user = `# 子树（根：${sub.title}）\n${sub.text}\n\n# 补充要求\n${dto.prompt?.trim() || '（无）'}`;

    const resolved = await this.providers.getActiveConfig(ctx.tenantId);
    const creds = resolved
      ? { url: resolved.endpoint, key: resolved.apiKey, model: resolved.model, provider: resolved.provider }
      : undefined;
    const hasGateway = !!(creds?.url || process.env.AI_GATEWAY_URL);
    const provider = hasGateway ? creds?.provider || process.env.AI_GATEWAY_PROVIDER || 'openai' : 'stub';
    const model = hasGateway ? creds?.model || process.env.AI_GATEWAY_MODEL || 'gpt-4o-mini' : 'stub';
    emit('meta', { provider, model });

    const stubText = `（示例摘要）「${sub.title}」共包含 ${Math.max(sub.count - 1, 0)} 个子节点，围绕该主题展开。配置真实 AI 网关后此处为模型生成的摘要初稿，可编辑后填入正文。`;
    const result = await callGatewayText({ system, user, signal, stubText, creds });

    for (const chunk of splitForStream(result.text)) emit('delta', { text: chunk });
    emit('done', { tokens: result.modelMeta.tokens });

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
  }

  /** 对话（SSE）：多轮对话询问节点子树上下文，输出 delta 文本流。 */
  async converse(dto: ConverseDto, ctx: Ctx, projectId: string, emit: Emit, signal: AbortSignal) {
    const snap = await this.changes.snapshot(dto.mapId, ctx);
    const sub = this.collectSubtree(snap.nodes, dto.nodeId);
    const system = `你是思谱 Mindline 的 AI 助手，当前上下文是一个思维导图子树。请结合以下上下文回答用户问题，回答简洁专业。\n\n# 当前子树（根：${sub.title}）\n${sub.text}`;

    const resolved = await this.providers.getActiveConfig(ctx.tenantId);
    const creds = resolved
      ? { url: resolved.endpoint, key: resolved.apiKey, model: resolved.model, provider: resolved.provider }
      : undefined;
    const hasGateway = !!(creds?.url || process.env.AI_GATEWAY_URL);
    const provider = hasGateway ? creds?.provider || process.env.AI_GATEWAY_PROVIDER || 'openai' : 'stub';
    const model = hasGateway ? creds?.model || process.env.AI_GATEWAY_MODEL || 'gpt-4o-mini' : 'stub';
    emit('meta', { provider, model });

    const lastUser = dto.messages.at(-1)?.content ?? '请分析这个子树';
    const historyText = dto.messages
      .slice(0, -1)
      .map((m) => `${m.role === 'user' ? '用户' : '助手'}：${m.content}`)
      .join('\n');
    const user = historyText ? `${historyText}\n\n用户：${lastUser}` : lastUser;

    const stubText = `（示例回复）关于「${sub.title}」子树，共有 ${Math.max(sub.count - 1, 0)} 个子节点。配置 AI 网关后可获得真实的对话回复。`;
    const result = await callGatewayText({ system, user, signal, stubText, creds });

    for (const chunk of splitForStream(result.text)) emit('delta', { text: chunk });
    emit('done', { tokens: result.modelMeta.tokens });

    try {
      await this.providers.record({
        tenantId: ctx.tenantId, projectId, userId: ctx.userId,
        capability: 'converse', provider: result.modelMeta.provider,
        model: result.modelMeta.model, tokensIn: result.modelMeta.tokens.in, tokensOut: result.modelMeta.tokens.out,
      });
    } catch { /* 计量失败忽略 */ }
  }

  /** 补全查重（SSE）：检测 title 与同级节点的相似度，输出分析文本。 */
  async complete(dto: CompleteDto, ctx: Ctx, projectId: string, emit: Emit, signal: AbortSignal) {
    const snap = await this.changes.snapshot(dto.mapId, ctx);
    const target = snap.nodes.find((n) => n.id === dto.nodeId);
    const siblings = snap.nodes.filter(
      (n) => n.parentId === (target?.parentId ?? null) && n.id !== dto.nodeId,
    );
    const siblingTitles = siblings.map((s) => `- ${s.title}`).join('\n') || '（无兄弟节点）';

    const system = `你是查重助手。判断新节点标题与已有兄弟节点是否重复或高度相似，简洁输出结论和建议（中文）。`;
    const user = `# 新标题\n${dto.title}\n\n# 已有兄弟节点\n${siblingTitles}`;

    const resolved = await this.providers.getActiveConfig(ctx.tenantId);
    const creds = resolved
      ? { url: resolved.endpoint, key: resolved.apiKey, model: resolved.model, provider: resolved.provider }
      : undefined;
    const provider = creds?.provider || process.env.AI_GATEWAY_PROVIDER || 'openai';
    const model = creds?.model || process.env.AI_GATEWAY_MODEL || 'gpt-4o-mini';
    emit('meta', { provider, model });

    const stubText = `（示例）标题「${dto.title}」与已有节点暂无明显重复，可安全使用。`;
    const result = await callGatewayText({ system, user, signal, stubText, creds });

    for (const chunk of splitForStream(result.text)) emit('delta', { text: chunk });
    emit('done', { tokens: result.modelMeta.tokens });

    try {
      await this.providers.record({
        tenantId: ctx.tenantId, projectId, userId: ctx.userId,
        capability: 'complete', provider: result.modelMeta.provider,
        model: result.modelMeta.model, tokensIn: result.modelMeta.tokens.in, tokensOut: result.modelMeta.tokens.out,
      });
    } catch { /* 计量失败忽略 */ }
  }

  /** 改写（SSE）：按 prompt 改写节点标题，输出改写结果文本流。 */
  async rewrite(dto: RewriteDto, ctx: Ctx, projectId: string, emit: Emit, signal: AbortSignal) {
    const snap = await this.changes.snapshot(dto.mapId, ctx);
    const target = snap.nodes.find((n) => n.id === dto.nodeId);

    const system = `你是改写助手。按用户要求改写思维导图节点标题，直接输出改写后的标题，不加多余解释。`;
    const user = `# 原标题\n${target?.title ?? '（未知）'}\n\n# 改写要求\n${dto.prompt}`;

    const resolved = await this.providers.getActiveConfig(ctx.tenantId);
    const creds = resolved
      ? { url: resolved.endpoint, key: resolved.apiKey, model: resolved.model, provider: resolved.provider }
      : undefined;
    const provider = creds?.provider || process.env.AI_GATEWAY_PROVIDER || 'openai';
    const model = creds?.model || process.env.AI_GATEWAY_MODEL || 'gpt-4o-mini';
    emit('meta', { provider, model });

    const stubText = `${target?.title ?? dto.prompt}（改写版）`;
    const result = await callGatewayText({ system, user, signal, stubText, creds });

    for (const chunk of splitForStream(result.text)) emit('delta', { text: chunk });
    emit('done', { tokens: result.modelMeta.tokens });

    try {
      await this.providers.record({
        tenantId: ctx.tenantId, projectId, userId: ctx.userId,
        capability: 'rewrite', provider: result.modelMeta.provider,
        model: result.modelMeta.model, tokensIn: result.modelMeta.tokens.in, tokensOut: result.modelMeta.tokens.out,
      });
    } catch { /* 计量失败忽略 */ }
  }
}
