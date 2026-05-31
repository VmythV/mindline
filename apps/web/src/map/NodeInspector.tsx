import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '../lib/api';
import type { ChangeList, NodeTypeList } from '../lib/types';
import type { MapRepository } from './MapRepository';
import type { NodeView } from './types';
import { DynamicField } from './DynamicField';

const OP_LABEL: Record<string, string> = {
  create: '创建',
  rename: '改名',
  move: '移动',
  setField: '改字段',
  setOwner: '改负责人',
  transfer: '移交',
  delete: '删除',
  aiGenerate: 'AI 生成',
  comment: '评论',
};

function fmtTime(ts: number): string {
  const d = new Date(ts);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getMonth() + 1}/${d.getDate()} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

/** 节点详情侧栏：标题 + 按类型 Schema 动态渲染字段表单 + 变更历史。 */
export function NodeInspector({
  repo,
  node,
  projectId,
}: {
  repo: MapRepository;
  node: NodeView;
  projectId: string;
}) {
  const [title, setTitle] = useState(node.title);

  const { data: types } = useQuery({
    queryKey: ['node-types', projectId],
    queryFn: () => api<NodeTypeList>(`/projects/${projectId}/node-types`),
    enabled: !!projectId,
  });
  const def = types?.items.find((t) => t.typeKey === node.type)?.definition;

  const { data: history } = useQuery({
    queryKey: ['node-history', repo.mapId, node.id],
    queryFn: () => api<ChangeList>(`/maps/${repo.mapId}/changes?node=${node.id}`),
    refetchInterval: 4000,
  });

  return (
    <aside className="w-80 shrink-0 border-l border-slate-200 bg-white p-4 space-y-4 overflow-auto">
      <div>
        <label className="text-xs text-slate-400">标题</label>
        <input
          className="w-full mt-1 px-2 py-1 rounded border border-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-300"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          onBlur={() => repo.rename(node.id, title.trim() || '未命名')}
        />
      </div>

      <div className="text-xs text-slate-400">
        类型：<span className="text-slate-600">{def?.displayName ?? node.type}</span>
      </div>

      {def?.fields.map((f) => (
        <div key={f.key}>
          <label className="text-xs text-slate-400">{f.label}</label>
          <DynamicField
            field={f}
            value={node.data[f.key]}
            onChange={(v) => repo.setField(node.id, f.key, v)}
          />
        </div>
      ))}

      <div>
        <label className="text-xs text-slate-400">历史</label>
        <ul className="mt-1 space-y-1.5 text-xs max-h-56 overflow-auto">
          {history?.items.map((c) => (
            <li key={c.id} className="border-l-2 border-slate-200 pl-2">
              <div>
                <span className="text-slate-700 font-medium">{OP_LABEL[c.op] ?? c.op}</span>
                {c.field && <span className="text-slate-500"> · {c.field}</span>}
                <span className="text-slate-400">
                  {' '}
                  · {c.actorName} · {fmtTime(c.ts)}
                </span>
              </div>
              {c.op === 'rename' && (
                <div className="text-slate-400 truncate">
                  {String(c.before ?? '')} → {String(c.after ?? '')}
                </div>
              )}
            </li>
          ))}
          {history && history.items.length === 0 && <li className="text-slate-400">暂无历史</li>}
        </ul>
      </div>
    </aside>
  );
}
