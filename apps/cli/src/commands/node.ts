import type { Command } from 'commander';
import type { NodeSnapshot } from '@mindline/shared';
import { request } from '../client';
import { output, info, fail } from '../output';

/** 拉取地图只读快照（落库态，可能滞后实时编辑数秒）。 */
async function fetchSnapshot(mapId: string): Promise<NodeSnapshot[]> {
  return request<NodeSnapshot[]>('GET', `/maps/${encodeURIComponent(mapId)}/snapshot`);
}

/** 按 parentId 分组并以 order（分数索引）升序，渲染缩进树。 */
function renderTree(nodes: NodeSnapshot[]): void {
  const byParent = new Map<string | null, NodeSnapshot[]>();
  for (const n of nodes) {
    const key = n.parentId;
    const arr = byParent.get(key) ?? [];
    arr.push(n);
    byParent.set(key, arr);
  }
  for (const arr of byParent.values()) arr.sort((a, b) => (a.order < b.order ? -1 : 1));

  const walk = (parentId: string | null, depth: number): void => {
    const children = byParent.get(parentId) ?? [];
    for (const n of children) {
      info(`${'  '.repeat(depth)}- [${n.type}] ${n.title}  (${n.id})`);
      walk(n.id, depth + 1);
    }
  };
  // 根：parentId 为 null，或父节点不在快照内
  const ids = new Set(nodes.map((n) => n.id));
  const roots = nodes.filter((n) => n.parentId === null || !ids.has(n.parentId));
  roots.sort((a, b) => (a.order < b.order ? -1 : 1));
  for (const r of roots) {
    info(`- [${r.type}] ${r.title}  (${r.id})`);
    walk(r.id, 1);
  }
}

export function registerNodeCommands(program: Command): void {
  const node = program.command('node').description('节点（只读：来自地图快照）');

  node
    .command('tree <mapId>')
    .description('以树形打印地图全部节点（GET /maps/:mapId/snapshot）')
    .action(async (mapId: string) => {
      const nodes = await fetchSnapshot(mapId);
      output(nodes, (ns) => {
        if (ns.length === 0) return info('（空地图）');
        renderTree(ns);
      });
    });

  node
    .command('get <mapId> <nodeId>')
    .description('查看单个节点详情（含自定义字段）')
    .action(async (mapId: string, nodeId: string) => {
      const nodes = await fetchSnapshot(mapId);
      const n = nodes.find((x) => x.id === nodeId);
      if (!n) fail('NOT_FOUND', `节点 ${nodeId} 不在地图 ${mapId} 的快照中`);
      output(n, (x) => {
        info(`节点：${x.title}`);
        info(`  id:      ${x.id}`);
        info(`  type:    ${x.type}`);
        info(`  parent:  ${x.parentId ?? '（根）'}`);
        info(`  owner:   ${x.ownerId ?? '-'}`);
        if (x.status) info(`  status:  ${x.status}`);
        if (x.tags?.length) info(`  tags:    ${x.tags.join(', ')}`);
        const keys = Object.keys(x.data ?? {});
        if (keys.length) {
          info('  data:');
          for (const k of keys) info(`    ${k}: ${JSON.stringify(x.data[k])}`);
        }
      });
    });
}
