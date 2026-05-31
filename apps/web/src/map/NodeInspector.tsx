import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api, apiStream } from '../lib/api';
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
  const deprecatedKeys = (node.data._deprecatedFields as string[] | undefined) ?? [];

  const { data: history } = useQuery({
    queryKey: ['node-history', repo.mapId, node.id],
    queryFn: () => api<ChangeList>(`/maps/${repo.mapId}/changes?node=${node.id}`),
    refetchInterval: 4000,
  });

  // AI 摘要（子树）：流式累积为可编辑初稿
  const [summary, setSummary] = useState('');
  const [summarizing, setSummarizing] = useState(false);
  const runSummarize = () => {
    setSummary('');
    setSummarizing(true);
    void apiStream(
      '/ai/summarize',
      { mapId: repo.mapId, nodeId: node.id },
      (event, data) => {
        if (event === 'delta') setSummary((s) => s + ((data as { text?: string }).text ?? ''));
        else if (event === 'done' || event === 'error') setSummarizing(false);
      },
    ).catch(() => setSummarizing(false));
  };

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

      <div>
        <label className="text-xs text-slate-400">类型</label>
        <select
          className="w-full mt-1 px-2 py-1 rounded border border-slate-200 text-sm"
          value={node.type}
          onChange={(e) => {
            const nt = types?.items.find((t) => t.typeKey === e.target.value);
            const keys = (nt?.definition.fields ?? []).map((f) => f.key);
            repo.setType(node.id, e.target.value, keys);
          }}
        >
          {(types?.items ?? []).map((t) => (
            <option key={t.id} value={t.typeKey}>
              {t.definition.displayName ?? t.typeKey}
            </option>
          ))}
        </select>
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

      {deprecatedKeys.length > 0 && (
        <div className="pt-2 border-t border-slate-100">
          <div className="text-xs text-amber-500 mb-1">已废弃字段（旧类型遗留 · 只读）</div>
          <ul className="space-y-1 text-xs">
            {deprecatedKeys.map((k) => (
              <li key={k} className="text-slate-500">
                <span className="text-slate-600">{k}</span>：{String(node.data[k] ?? '')}
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="pt-2 border-t border-slate-100">
        <div className="flex items-center justify-between">
          <label className="text-xs text-slate-400">AI 摘要</label>
          <button
            className="text-xs text-blue-600 hover:underline disabled:opacity-50"
            disabled={summarizing}
            onClick={runSummarize}
          >
            {summarizing ? '生成中…' : '🤖 生成摘要'}
          </button>
        </div>
        {(summary || summarizing) && (
          <>
            <textarea
              className="w-full mt-1 px-2 py-1 rounded border border-slate-200 text-xs h-24 resize-y"
              value={summary}
              onChange={(e) => setSummary(e.target.value)}
              placeholder="生成中…"
            />
            <button
              className="mt-1 text-xs text-slate-500 hover:text-blue-600 disabled:opacity-50"
              disabled={!summary.trim()}
              onClick={() => repo.setField(node.id, 'desc', `<p>${summary.trim()}</p>`)}
            >
              填入正文（desc）
            </button>
          </>
        )}
      </div>

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
