import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/api';
import type { MilestoneList, SuggestResp } from '../lib/types';
import type { NodeView } from './types';

const fmt = (ts: number | null) => (ts ? new Date(ts).toLocaleDateString() : '');

/** 时间轴顶部的里程碑区：列表/展开编辑 aiSummary/删除 + 标记表单 + AI 建议采纳。 */
export function MilestonesSection({ projectId, nodes }: { projectId: string; nodes?: NodeView[] }) {
  const qc = useQueryClient();
  const key = ['milestones', projectId];
  const { data } = useQuery({
    queryKey: key,
    queryFn: () => api<MilestoneList>(`/projects/${projectId}/milestones`),
    enabled: !!projectId,
  });
  const invalidate = () => void qc.invalidateQueries({ queryKey: key });

  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState({ title: '', description: '', nodeId: '' });
  const [expanded, setExpanded] = useState<string | null>(null);
  const [suggest, setSuggest] = useState<SuggestResp | null>(null);
  const [suggesting, setSuggesting] = useState(false);

  const create = useMutation({
    mutationFn: (body: Record<string, unknown>) =>
      api<{ id: string }>(`/projects/${projectId}/milestones`, {
        method: 'POST',
        body: JSON.stringify(body),
      }),
    onSuccess: () => {
      setForm({ title: '', description: '', nodeId: '' });
      setAdding(false);
      invalidate();
    },
  });
  const patch = useMutation({
    mutationFn: (v: { id: string; body: Record<string, unknown> }) =>
      api<{ id: string }>(`/milestones/${v.id}`, { method: 'PATCH', body: JSON.stringify(v.body) }),
    onSuccess: invalidate,
  });
  const del = useMutation({
    mutationFn: (id: string) => api<void>(`/milestones/${id}`, { method: 'DELETE' }),
    onSuccess: invalidate,
  });

  const runSuggest = async () => {
    setSuggesting(true);
    setSuggest(null);
    try {
      const r = await api<SuggestResp>(`/projects/${projectId}/milestones/ai-suggest`, {
        method: 'POST',
        body: JSON.stringify({ range: { from: Date.now() - 30 * 86_400_000, to: Date.now() } }),
      });
      setSuggest(r);
    } catch {
      /* ignore */
    } finally {
      setSuggesting(false);
    }
  };

  const nodeTitle = (id: string | null) =>
    id ? (nodes?.find((n) => n.id === id)?.title ?? id) : null;

  return (
    <div className="border-b border-slate-100 p-3 space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium text-slate-600">里程碑</span>
        <div className="flex gap-2">
          <button className="text-xs text-blue-600 hover:underline" onClick={() => setAdding((v) => !v)}>
            + 标记
          </button>
          <button
            className="text-xs text-blue-600 hover:underline disabled:opacity-50"
            disabled={suggesting}
            onClick={runSuggest}
          >
            {suggesting ? '分析中…' : 'AI 建议'}
          </button>
        </div>
      </div>

      {adding && (
        <div className="space-y-1.5 bg-slate-50 rounded p-2">
          <input
            className="w-full border border-slate-200 rounded px-2 py-1 text-xs"
            placeholder="名称"
            value={form.title}
            onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
          />
          <input
            className="w-full border border-slate-200 rounded px-2 py-1 text-xs"
            placeholder="说明（可选）"
            value={form.description}
            onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
          />
          <select
            className="w-full border border-slate-200 rounded px-2 py-1 text-xs"
            value={form.nodeId}
            onChange={(e) => setForm((f) => ({ ...f, nodeId: e.target.value }))}
          >
            <option value="">不锚定节点</option>
            {[...(nodes ?? [])].map((n) => (
              <option key={n.id} value={n.id}>
                {n.title || '(未命名)'}
              </option>
            ))}
          </select>
          <button
            className="text-xs px-2 py-1 rounded bg-blue-500 text-white disabled:opacity-50"
            disabled={!form.title.trim() || create.isPending}
            onClick={() =>
              create.mutate({
                title: form.title.trim(),
                description: form.description || undefined,
                nodeId: form.nodeId || undefined,
              })
            }
          >
            创建
          </button>
        </div>
      )}

      {suggest && (
        <div className="bg-amber-50 rounded p-2 space-y-1.5 text-xs">
          <div className="text-amber-600">AI 建议（近 30 天）</div>
          {suggest.suggestions.length === 0 && <div className="text-slate-400">该区间无明显里程碑</div>}
          {suggest.suggestions.map((s, i) => (
            <div key={i} className="flex items-start gap-2">
              <div className="flex-1">
                <div className="text-slate-700">{s.title}</div>
                <div className="text-slate-400">{s.reason}</div>
              </div>
              <button
                className="text-blue-600 hover:underline shrink-0"
                onClick={() =>
                  create.mutate({
                    title: s.title,
                    description: s.reason,
                    nodeId: s.anchorNodeId || undefined,
                  })
                }
              >
                采纳
              </button>
            </div>
          ))}
          {suggest.summaryDraft && (
            <div className="pt-1 border-t border-amber-100">
              <div className="text-amber-600 mb-0.5">阶段摘要初稿</div>
              <div className="text-slate-500">{suggest.summaryDraft}</div>
            </div>
          )}
          <button className="text-slate-400 hover:text-slate-600" onClick={() => setSuggest(null)}>
            关闭
          </button>
        </div>
      )}

      <ul className="space-y-1">
        {data?.items.map((m) => (
          <li key={m.id} className="text-xs">
            <div className="flex items-center gap-2">
              <button
                className="flex-1 text-left text-slate-700 hover:text-blue-600 truncate"
                onClick={() => setExpanded((x) => (x === m.id ? null : m.id))}
              >
                🚩 {m.title}
                {nodeTitle(m.nodeId) && <span className="text-slate-400"> · {nodeTitle(m.nodeId)}</span>}
                {m.rangeStart && (
                  <span className="text-slate-400">
                    {' '}
                    · {fmt(m.rangeStart)}
                    {m.rangeEnd ? `~${fmt(m.rangeEnd)}` : ''}
                  </span>
                )}
              </button>
              <button className="text-rose-400 hover:text-rose-600 shrink-0" onClick={() => del.mutate(m.id)}>
                删
              </button>
            </div>
            {expanded === m.id && (
              <div className="mt-1 pl-4 space-y-1">
                {m.description && <div className="text-slate-500">{m.description}</div>}
                <textarea
                  className="w-full border border-slate-200 rounded px-2 py-1 text-xs h-16 resize-y"
                  defaultValue={m.aiSummary ?? ''}
                  placeholder="AI 摘要（可编辑，失焦保存）"
                  onBlur={(e) => {
                    if (e.target.value !== (m.aiSummary ?? ''))
                      patch.mutate({ id: m.id, body: { aiSummary: e.target.value } });
                  }}
                />
              </div>
            )}
          </li>
        ))}
        {data && data.items.length === 0 && <li className="text-slate-400 text-xs">暂无里程碑</li>}
      </ul>
    </div>
  );
}
