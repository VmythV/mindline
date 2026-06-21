import type { Command } from 'commander';
import { request } from '../client';
import { output, info } from '../output';

interface Channel {
  id: string;
  name: string;
  type: string;
}

export function registerImCommands(program: Command): void {
  const im = program.command('im').description('IM 渠道与手动发布');

  im.command('channels <projectId>')
    .description('列出项目 IM 渠道（GET /projects/:id/im-channels）')
    .action(async (projectId: string) => {
      const res = await request<Channel[]>(
        'GET',
        `/projects/${encodeURIComponent(projectId)}/im-channels`,
      );
      output(res, (chs) => {
        if (chs.length === 0) return info('（无渠道）');
        for (const c of chs) info(`${c.id}  [${c.type}] ${c.name}`);
      });
    });

  im.command('publish <channelId> <type> <targetId>')
    .description('发布卡片到 IM 渠道（type: node|milestone|summary）（POST /im/publish）')
    .option('--content <text>', '自定义内容（留空则自动生成）')
    .action(
      async (channelId: string, type: string, targetId: string, opts: { content?: string }) => {
        const res = await request<unknown>('POST', '/im/publish', {
          channelId,
          type,
          targetId,
          ...(opts.content ? { content: opts.content } : {}),
        });
        output(res, () => info('✓ 已发布'));
      },
    );
}
