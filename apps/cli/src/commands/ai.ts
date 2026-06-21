import type { Command } from 'commander';
import { stream } from '../client';
import { output, info, isJson, fail } from '../output';

/** 从松散结构中安全取字符串字段（SSE data 形态随服务端微调）。 */
function pickString(d: unknown, ...keys: string[]): string {
  if (typeof d === 'string') return d;
  if (d && typeof d === 'object') {
    for (const k of keys) {
      const v = (d as Record<string, unknown>)[k];
      if (typeof v === 'string') return v;
    }
  }
  return '';
}

interface SseError {
  code: string;
  message: string;
}

/** 监听 SIGINT，向上游透传 abort（与服务端 60s 超时/中断模型一致）。 */
async function withAbort(fn: (signal: AbortSignal) => Promise<void>): Promise<void> {
  const ac = new AbortController();
  const onSig = () => ac.abort();
  process.on('SIGINT', onSig);
  try {
    await fn(ac.signal);
  } finally {
    process.off('SIGINT', onSig);
  }
}

export function registerAiCommands(program: Command): void {
  const ai = program.command('ai').description('AI 拆解 / 摘要（SSE，只展示结果，不写入协同文档）');

  ai.command('decompose <mapId> <nodeId>')
    .description('对节点跑 AI 拆解，输出生成的子节点提案（POST /ai/decompose）')
    .option('--type <typeKey>', '目标子节点类型')
    .option('--max <n>', '最大子节点数（1-20）', (v) => parseInt(v, 10))
    .option('--prompt <text>', '额外指令')
    .option('--lang <lang>', '输出语言')
    .action(
      async (
        mapId: string,
        nodeId: string,
        opts: { type?: string; max?: number; prompt?: string; lang?: string },
      ) => {
        const body = {
          mapId,
          nodeId,
          ...(opts.type ? { targetType: opts.type } : {}),
          ...(opts.max ? { maxChildren: opts.max } : {}),
          ...(opts.prompt ? { prompt: opts.prompt } : {}),
          ...(opts.lang ? { lang: opts.lang } : {}),
        };
        let meta: unknown;
        let done: unknown;
        let err: SseError | undefined;
        const ops: unknown[] = [];

        info('正在拆解…');
        await withAbort((signal) =>
          stream(
            '/ai/decompose',
            body,
            (event, data) => {
              if (event === 'meta') meta = data;
              else if (event === 'op') {
                ops.push(data);
                info(`  + ${pickString(data, 'title') || JSON.stringify(data)}`);
              } else if (event === 'done') done = data;
              else if (event === 'error') err = data as SseError;
            },
            signal,
          ),
        );

        if (err) fail(err.code, err.message);
        output({ meta, ops, done }, () => info(`✓ 拆解完成，共生成 ${ops.length} 个节点提案`));
      },
    );

  ai.command('summarize <mapId> <nodeId>')
    .description('对子树生成摘要初稿（POST /ai/summarize）')
    .option('--scope <scope>', 'subtree | node', 'subtree')
    .option('--prompt <text>', '额外指令')
    .option('--lang <lang>', '输出语言')
    .action(
      async (
        mapId: string,
        nodeId: string,
        opts: { scope?: string; prompt?: string; lang?: string },
      ) => {
        const body = {
          mapId,
          nodeId,
          scope: opts.scope === 'node' ? 'node' : 'subtree',
          ...(opts.prompt ? { prompt: opts.prompt } : {}),
          ...(opts.lang ? { lang: opts.lang } : {}),
        };
        let text = '';
        let err: SseError | undefined;

        await withAbort((signal) =>
          stream(
            '/ai/summarize',
            body,
            (event, data) => {
              if (event === 'delta') {
                const chunk = pickString(data, 'text', 'delta', 'content');
                text += chunk;
                if (!isJson()) process.stdout.write(chunk);
              } else if (event === 'error') err = data as SseError;
            },
            signal,
          ),
        );

        if (!isJson()) process.stdout.write('\n');
        if (err) fail(err.code, err.message);
        output({ summary: text }, () => {
          /* 文本已在流式阶段输出 */
        });
      },
    );
}
