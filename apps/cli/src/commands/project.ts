import type { Command } from 'commander';
import { request } from '../client';
import { output, info } from '../output';

interface ProjectItem {
  id: string;
  name: string;
  parentId: string | null;
  mapId: string | null;
  role?: string;
}

export function registerProjectCommands(program: Command): void {
  const project = program.command('project').description('项目（含父子项目）');

  project
    .command('list')
    .description('列出项目（GET /projects）')
    .option('--parent <projectId>', '仅列出某父项目下的子项目')
    .action(async (opts: { parent?: string }) => {
      const qs = opts.parent ? `?parentId=${encodeURIComponent(opts.parent)}` : '';
      const res = await request<{ items: ProjectItem[] }>('GET', `/projects${qs}`);
      output(res.items, (items) => {
        if (items.length === 0) return info('（无项目）');
        for (const p of items) {
          const role = p.role ? ` [${p.role}]` : '';
          info(`${p.id}  ${p.name}${role}   map=${p.mapId ?? '-'}`);
        }
      });
    });

  project
    .command('get <projectId>')
    .description('查看项目详情（GET /projects/:id）')
    .action(async (projectId: string) => {
      const res = await request<ProjectItem>('GET', `/projects/${encodeURIComponent(projectId)}`);
      output(res, (p) => {
        info(`项目：${p.name}`);
        info(`  id:     ${p.id}`);
        info(`  parent: ${p.parentId ?? '（根）'}`);
        info(`  map:    ${p.mapId ?? '-'}`);
        if (p.role) info(`  role:   ${p.role}`);
      });
    });

  project
    .command('create <name>')
    .description('新建项目（自动建关联 map）（POST /projects）')
    .option('--parent <projectId>', '作为某项目的子项目')
    .action(async (name: string, opts: { parent?: string }) => {
      const res = await request<ProjectItem>('POST', '/projects', {
        name,
        ...(opts.parent ? { parentId: opts.parent } : {}),
      });
      output(res, (p) => info(`✓ 已创建项目 ${p.name}  (${p.id})  map=${p.mapId ?? '-'}`));
    });
}
