import type { NodeTypeDefinition } from '@mindline/shared';
import type { DecomposeContext } from './context-builder';

/** emit_subtree 函数定义（AI拆解详设 §3.3）。最小闭环不递归 children。 */
export const EMIT_SUBTREE_FUNCTION = {
  name: 'emit_subtree',
  description: '返回为目标节点生成的直接子节点列表',
  parameters: {
    type: 'object',
    required: ['nodes'],
    properties: {
      nodes: {
        type: 'array',
        items: {
          type: 'object',
          required: ['title'],
          properties: {
            title: { type: 'string', maxLength: 60 },
            type: { type: 'string' },
            data: { type: 'object' },
          },
        },
      },
    },
  },
} as const;

export function buildSystemPrompt(maxChildren: number, lang: string): string {
  return [
    '你是思维导图拆解助手。',
    `仅输出目标节点的【直接子节点】，不要重复已有子节点；数量不超过 ${maxChildren} 个。`,
    '子节点之间尽量 MECE（互斥且穷尽），标题精炼（不超过 60 字）。',
    '若提供了目标类型 Schema，请按字段填写 data（枚举值必须取给定选项之一）。',
    `输出语言：${lang}。`,
    '必须通过 emit_subtree 函数返回结构化结果，不要输出自由文本。',
  ].join('\n');
}

export function buildUserPrompt(
  ctx: DecomposeContext,
  schema: NodeTypeDefinition | null,
  userPrompt?: string,
): string {
  const blocks: string[] = [];
  blocks.push(`# 目标节点\n- 类型：${ctx.target.type}\n- 标题：${ctx.target.title}`);
  if (ctx.ancestors.length) {
    blocks.push('# 上级路径\n' + ctx.ancestors.map((a) => `- ${a.title}（${a.type}）`).join('\n'));
  }
  if (ctx.siblings.length) {
    blocks.push('# 同级已有\n' + ctx.siblings.map((s) => `- ${s.title}`).join('\n'));
  }
  if (ctx.children.length) {
    blocks.push('# 已有子节点（勿重复）\n' + ctx.children.map((c) => `- ${c.title}`).join('\n'));
  }
  if (schema) {
    const fields = schema.fields
      .map((f) => `- ${f.key}（${f.type}${f.options ? '：' + f.options.join('/') : ''}）`)
      .join('\n');
    blocks.push(`# 目标类型 Schema（${schema.displayName}）\n${fields}`);
  }
  blocks.push(`# 补充要求\n${userPrompt?.trim() || '（无）'}`);
  return blocks.join('\n\n');
}
