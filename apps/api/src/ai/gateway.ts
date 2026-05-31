import type { ProposalModelMeta } from '@mindline/shared';

/** 模型返回的原始子节点（未校验）。最小闭环 depth=1，忽略 children。 */
export interface RawNode {
  title: string;
  type?: string;
  data?: Record<string, unknown>;
}

export interface GatewayResult {
  nodes: RawNode[];
  modelMeta: ProposalModelMeta;
}

interface GatewayParams {
  system: string;
  user: string;
  functionDef: Record<string, unknown>;
  signal?: AbortSignal;
  retryHint?: boolean; // 协议级失败重试时追加“必须用函数返回”提示
  stubTitles: string[]; // 无网关时的降级标题
  creds?: { url?: string; key?: string; model?: string; provider?: string }; // 租户解析后的凭证（优先于 env）
}

interface ChatResp {
  choices?: {
    message?: {
      content?: string;
      tool_calls?: { function?: { arguments?: string } }[];
    };
  }[];
  usage?: { prompt_tokens?: number; completion_tokens?: number };
}

function parseNodes(text: string | undefined): RawNode[] {
  if (!text) return [];
  try {
    const parsed = JSON.parse(text) as { nodes?: RawNode[] } | RawNode[];
    const nodes = Array.isArray(parsed) ? parsed : (parsed.nodes ?? []);
    return nodes.filter((n) => n && typeof n.title === 'string');
  } catch {
    return [];
  }
}

/**
 * 薄适配层：调用 OpenAI 兼容 /chat/completions（functionCall 优先，降级 jsonMode 解析 content）。
 * AI_GATEWAY_URL 为空 → stub 降级（便于无 key 本地演示）。
 */
export async function callGateway(p: GatewayParams): Promise<GatewayResult> {
  // 租户凭证优先，回退 env
  const url = p.creds?.url || process.env.AI_GATEWAY_URL;
  const model = p.creds?.model || process.env.AI_GATEWAY_MODEL || 'gpt-4o-mini';
  const provider = p.creds?.provider || process.env.AI_GATEWAY_PROVIDER || 'openai';
  const apiKey = p.creds?.key || process.env.AI_GATEWAY_KEY;

  if (!url) {
    return {
      nodes: p.stubTitles.map((title) => ({ title })),
      modelMeta: { provider: 'stub', model: 'stub', tokens: { in: 0, out: 0 } },
    };
  }

  const system = p.retryHint
    ? `${p.system}\n（重要：必须调用 emit_subtree 函数返回结构化结果）`
    : p.system;
  const body = {
    model,
    messages: [
      { role: 'system', content: system },
      { role: 'user', content: p.user },
    ],
    tools: [{ type: 'function', function: p.functionDef }],
    tool_choice: { type: 'function', function: { name: 'emit_subtree' } },
    temperature: 0.4,
  };

  const res = await fetch(`${url.replace(/\/$/, '')}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {}),
    },
    body: JSON.stringify(body),
    signal: p.signal,
  });
  if (!res.ok) throw new Error(`模型网关返回 HTTP ${res.status}`);

  const json = (await res.json()) as ChatResp;
  const msg = json.choices?.[0]?.message;
  // functionCall 优先；无 tool_calls → 降级解析 content（jsonMode）
  const nodes = msg?.tool_calls?.[0]?.function?.arguments
    ? parseNodes(msg.tool_calls[0].function.arguments)
    : parseNodes(msg?.content);
  const usage = json.usage ?? {};
  return {
    nodes,
    modelMeta: {
      provider,
      model,
      tokens: { in: usage.prompt_tokens ?? 0, out: usage.completion_tokens ?? 0 },
    },
  };
}

interface TextParams {
  system: string;
  user: string;
  signal?: AbortSignal;
  stubText: string;
  creds?: { url?: string; key?: string; model?: string; provider?: string };
}

export interface TextResult {
  text: string;
  modelMeta: ProposalModelMeta;
}

/** 纯文本补全（无 tools），用于 summarize。无网关 → stub 返回 stubText。 */
export async function callGatewayText(p: TextParams): Promise<TextResult> {
  const url = p.creds?.url || process.env.AI_GATEWAY_URL;
  const model = p.creds?.model || process.env.AI_GATEWAY_MODEL || 'gpt-4o-mini';
  const provider = p.creds?.provider || process.env.AI_GATEWAY_PROVIDER || 'openai';
  const apiKey = p.creds?.key || process.env.AI_GATEWAY_KEY;

  if (!url) {
    return { text: p.stubText, modelMeta: { provider: 'stub', model: 'stub', tokens: { in: 0, out: 0 } } };
  }

  const res = await fetch(`${url.replace(/\/$/, '')}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {}),
    },
    body: JSON.stringify({
      model,
      messages: [
        { role: 'system', content: p.system },
        { role: 'user', content: p.user },
      ],
      temperature: 0.3,
    }),
    signal: p.signal,
  });
  if (!res.ok) throw new Error(`模型网关返回 HTTP ${res.status}`);

  const json = (await res.json()) as ChatResp;
  const text = json.choices?.[0]?.message?.content ?? '';
  const usage = json.usage ?? {};
  return {
    text,
    modelMeta: {
      provider,
      model,
      tokens: { in: usage.prompt_tokens ?? 0, out: usage.completion_tokens ?? 0 },
    },
  };
}
