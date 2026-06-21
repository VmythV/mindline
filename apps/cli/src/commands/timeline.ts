import type { Command } from 'commander';
import { request } from '../client';
import { output, info } from '../output';

/** 变更事件返回形态较宽松（服务端可能附 actor 展示信息），按需取字段。 */
type ChangeRow = Record<string, unknown>;

interface ListResult {
  items: ChangeRow[];
  nextCursor?: string | null;
}

function str(row: ChangeRow, ...keys: string[]): string {
  for (const k of keys) {
    const v = row[k];
    if (typeof v === 'string') return v;
    if (typeof v === 'number') return String(v);
  }
  return '-';
}

function renderRows(items: ChangeRow[]): void {
  if (items.length === 0) return info('（无变更记录）');
  for (const r of items) {
    const op = str(r, 'op');
    const nodeId = str(r, 'nodeId');
    const actor = str(r, 'actorName', 'actorId', 'actor');
    const at = str(r, 'createdAt', 'ts', 'at');
    const field = r['field'] ? ` field=${str(r, 'field')}` : '';
    info(`${at}  [${op}] ${nodeId}  by ${actor}${field}`);
  }
}

export function registerTimelineCommands(program: Command): void {
  program
    .command('timeline <mapId>')
    .description('地图变更时间轴（GET /maps/:mapId/changes）')
    .option('--limit <n>', '返回条数', (v) => parseInt(v, 10))
    .option('--node <nodeId>', '仅看某节点')
    .option('--actor <userId>', '仅看某人')
    .option('--op <op>', '操作类型（create/delete/move/rename/setField/aiGenerate…）')
    .option('--branch <nodeId>', '仅看某子树（分支）')
    .option('--from <epochMs>', '起始时间（epoch ms）', (v) => parseInt(v, 10))
    .option('--to <epochMs>', '结束时间（epoch ms）', (v) => parseInt(v, 10))
    .option('--cursor <cursor>', '分页游标')
    .action(
      async (
        mapId: string,
        opts: {
          limit?: number;
          node?: string;
          actor?: string;
          op?: string;
          branch?: string;
          from?: number;
          to?: number;
          cursor?: string;
        },
      ) => {
        const q = new URLSearchParams();
        if (opts.limit) q.set('limit', String(opts.limit));
        if (opts.node) q.set('node', opts.node);
        if (opts.actor) q.set('actor', opts.actor);
        if (opts.op) q.set('op', opts.op);
        if (opts.branch) q.set('branch', opts.branch);
        if (opts.from) q.set('from', String(opts.from));
        if (opts.to) q.set('to', String(opts.to));
        if (opts.cursor) q.set('cursor', opts.cursor);
        const qs = q.toString();
        const res = await request<ListResult>(
          'GET',
          `/maps/${encodeURIComponent(mapId)}/changes${qs ? `?${qs}` : ''}`,
        );
        output(res, (r) => renderRows(r.items));
      },
    );

  program
    .command('history <nodeId>')
    .description('单节点字段级历史（GET /nodes/:nodeId/history）')
    .option('--limit <n>', '返回条数', (v) => parseInt(v, 10))
    .option('--cursor <cursor>', '分页游标')
    .action(async (nodeId: string, opts: { limit?: number; cursor?: string }) => {
      const q = new URLSearchParams();
      if (opts.limit) q.set('limit', String(opts.limit));
      if (opts.cursor) q.set('cursor', opts.cursor);
      const qs = q.toString();
      const res = await request<ListResult>(
        'GET',
        `/nodes/${encodeURIComponent(nodeId)}/history${qs ? `?${qs}` : ''}`,
      );
      output(res, (r) => renderRows(r.items));
    });
}
