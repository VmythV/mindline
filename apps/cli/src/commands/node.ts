import type { Command } from 'commander';
import type { NodeSnapshot, Command as MapCommand, ExecuteCommandsResult } from '@mindline/shared';
import { request } from '../client';
import { output, info, fail } from '../output';

interface SnapshotResponse {
  mapId: string;
  version: number;
  nodes: NodeSnapshot[];
  generatedAt: number;
}

/** 拉取地图只读快照（落库态，可能滞后实时编辑数秒）。 */
async function fetchSnapshot(mapId: string): Promise<NodeSnapshot[]> {
  const res = await request<SnapshotResponse>('GET', `/maps/${encodeURIComponent(mapId)}/snapshot`);
  return res.nodes ?? [];
}

/** 经服务端写通道执行命令层命令（写入协同文档 + 落库 + 广播）。 */
async function exec(mapId: string, commands: MapCommand[]): Promise<ExecuteCommandsResult> {
  return request<ExecuteCommandsResult>('POST', `/maps/${encodeURIComponent(mapId)}/commands`, {
    commands,
  });
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
  const node = program.command('node').description('节点：只读查询（快照）+ 协同写入（命令）');

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

  // ===== 协同写入（经 api 写通道，需 Editor+；写入实时广播给所有在线客户端） =====

  node
    .command('init <mapId>')
    .description('确保空地图存在根节点（建图后起步用）')
    .action(async (mapId: string) => {
      const res = await exec(mapId, [{ kind: 'ensureRoot' }]);
      output(res, (r) => info(`✓ 根节点 ${r.created[0] ?? '(已存在)'}`));
    });

  node
    .command('create <mapId> <parentId>')
    .description('在父节点下新建子节点')
    .option('--title <title>', '标题', '新节点')
    .option('--type <typeKey>', '节点类型（默认 idea）')
    .action(async (mapId: string, parentId: string, opts: { title: string; type?: string }) => {
      const res = await exec(mapId, [
        {
          kind: 'createChild',
          parentId,
          title: opts.title,
          ...(opts.type ? { type: opts.type } : {}),
        },
      ]);
      output(res, (r) => info(`✓ 已创建节点 ${r.created[0] ?? ''}`));
    });

  node
    .command('rename <mapId> <nodeId> <title>')
    .description('重命名节点')
    .action(async (mapId: string, nodeId: string, title: string) => {
      const res = await exec(mapId, [{ kind: 'rename', nodeId, title }]);
      output(res, () => info('✓ 已重命名'));
    });

  node
    .command('move <mapId> <nodeId> <newParentId>')
    .description('移动节点到新父（禁止移入自身子树）')
    .action(async (mapId: string, nodeId: string, newParentId: string) => {
      const res = await exec(mapId, [{ kind: 'move', nodeId, newParentId }]);
      output(res, () => info('✓ 已移动'));
    });

  node
    .command('delete <mapId> <nodeId>')
    .description('删除节点及其整棵子树')
    .action(async (mapId: string, nodeId: string) => {
      const res = await exec(mapId, [{ kind: 'delete', nodeId }]);
      output(res, (r) => info(`✓ 已删除（${r.eventCount} 个节点）`));
    });

  node
    .command('set-owner <mapId> <nodeId> <userId>')
    .description('设置节点负责人（产出 setOwner 审计事件）')
    .action(async (mapId: string, nodeId: string, userId: string) => {
      const res = await exec(mapId, [{ kind: 'setOwner', nodeId, ownerId: userId }]);
      output(res, () => info('✓ 已设置负责人'));
    });

  node
    .command('set-field <mapId> <nodeId> <field> <value>')
    .description('设置节点字段（value 优先按 JSON 解析，失败则按字符串）')
    .action(async (mapId: string, nodeId: string, field: string, value: string) => {
      let parsed: unknown = value;
      try {
        parsed = JSON.parse(value);
      } catch {
        /* 非 JSON，保留字符串 */
      }
      const res = await exec(mapId, [{ kind: 'setField', nodeId, field, value: parsed }]);
      output(res, () => info('✓ 已更新字段'));
    });
}
