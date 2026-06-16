import { useEffect, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api, apiStream } from '../lib/api';
import type { ChangeList, NodeTypeList } from '../lib/types';
import type { MapRepository } from './MapRepository';
import type { NodeView } from './types';
import { DynamicField } from './DynamicField';
import type { NodeLink } from '@mindline/shared';
import { useDialog } from '../ui/DialogProvider';

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

interface Comment {
  id: string;
  body: string;
  authorId: string;
  displayName: string;
  avatarUrl: string | null;
  resolved: boolean;
  createdAt: number;
  mentions: string[] | null;
}

interface NodeRefInfo {
  nodeId: string;
  title: string;
  mapId: string;
  projectName: string;
}

/** 跨项目引用面板：展示 links 列表，支持添加/移除。 */
function NodeLinksPanel({ repo, node }: { repo: MapRepository; node: NodeView }) {
  const links = (node.data.links as NodeLink[] | undefined) ?? [];
  const [addOpen, setAddOpen] = useState(false);
  const [inputId, setInputId] = useState('');
  const [kind, setKind] = useState<NodeLink['kind']>('reference');

  const { data: resolved } = useQuery<NodeRefInfo[]>({
    queryKey: ['node-refs', links.map((l) => l.targetId).join(',')],
    queryFn: () =>
      api('/nodes/resolve', {
        method: 'POST',
        body: JSON.stringify({ ids: links.map((l) => l.targetId) }),
      }),
    enabled: links.length > 0,
  });

  const refMap = new Map<string, NodeRefInfo>(resolved?.map((r) => [r.nodeId, r]));

  return (
    <div className="pt-2 border-t border-slate-100">
      <div className="flex items-center justify-between mb-1">
        <label className="text-xs text-slate-400">跨项目引用</label>
        <button
          className="text-xs text-blue-500 hover:text-blue-700"
          onClick={() => setAddOpen((v) => !v)}
        >
          {addOpen ? '取消' : '+ 添加'}
        </button>
      </div>

      {addOpen && (
        <div className="flex items-center gap-1 mb-2">
          <select
            className="px-1 py-0.5 text-xs rounded border border-slate-200"
            value={kind}
            onChange={(e) => setKind(e.target.value as NodeLink['kind'])}
          >
            <option value="reference">引用节点</option>
            <option value="subproject">子项目</option>
          </select>
          <input
            className="flex-1 px-2 py-0.5 text-xs rounded border border-slate-200 focus:outline-none focus:ring-1 focus:ring-blue-300"
            placeholder="节点 ID 或项目 ID"
            value={inputId}
            onChange={(e) => setInputId(e.target.value.trim())}
            onKeyDown={(e) => {
              e.stopPropagation();
              if (e.key === 'Enter' && inputId) {
                repo.addLink(node.id, { kind, targetId: inputId });
                setInputId('');
                setAddOpen(false);
              }
            }}
          />
          <button
            className="px-2 py-0.5 text-xs rounded bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50"
            disabled={!inputId}
            onClick={() => {
              repo.addLink(node.id, { kind, targetId: inputId });
              setInputId('');
              setAddOpen(false);
            }}
          >
            确认
          </button>
        </div>
      )}

      {links.length === 0 && !addOpen && <p className="text-xs text-slate-400">暂无引用</p>}

      <ul className="space-y-1">
        {links.map((l) => {
          const info = refMap.get(l.targetId);
          return (
            <li key={`${l.kind}-${l.targetId}`} className="flex items-center gap-1 text-xs">
              <span className="shrink-0 text-slate-400">
                {l.kind === 'subproject' ? '📁' : '🔗'}
              </span>
              <span className="flex-1 text-blue-600 truncate" title={l.targetId}>
                {info ? `${info.projectName} / ${info.title}` : l.targetId}
              </span>
              <button
                className="text-slate-300 hover:text-red-500 shrink-0"
                onClick={() => repo.removeLink(node.id, l.targetId, l.kind)}
              >
                ×
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

/** 节点详情侧栏：标题 + 按类型 Schema 动态渲染字段表单 + 软权限 + 评论 + 变更历史。 */
export function NodeInspector({
  repo,
  node,
  projectId,
  myUserId,
}: {
  repo: MapRepository;
  node: NodeView;
  projectId: string;
  myUserId?: string;
}) {
  const qc = useQueryClient();
  const dialog = useDialog();
  const [title, setTitle] = useState(node.title);
  const [commentDraft, setCommentDraft] = useState('');
  useEffect(() => setTitle(node.title), [node.id, node.title]);
  const commitTitle = () => repo.rename(node.id, title.trim() || '未命名');

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

  const { data: comments } = useQuery({
    queryKey: ['comments', repo.mapId, node.id],
    queryFn: () => api<{ items: Comment[] }>(`/maps/${repo.mapId}/nodes/${node.id}/comments`),
    refetchInterval: 8000,
  });

  const addComment = useMutation({
    mutationFn: (body: string) =>
      api(`/maps/${repo.mapId}/nodes/${node.id}/comments`, {
        method: 'POST',
        body: JSON.stringify({ body }),
      }),
    onSuccess: () => {
      setCommentDraft('');
      void qc.invalidateQueries({ queryKey: ['comments', repo.mapId, node.id] });
      void qc.invalidateQueries({ queryKey: ['node-history', repo.mapId, node.id] });
    },
  });

  const resolveComment = useMutation({
    mutationFn: ({ id, resolved }: { id: string; resolved: boolean }) =>
      api(`/comments/${id}`, { method: 'PATCH', body: JSON.stringify({ resolved }) }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['comments', repo.mapId, node.id] });
      void qc.invalidateQueries({ queryKey: ['node-history', repo.mapId, node.id] });
    },
  });

  // AI 摘要（子树）：流式累积为可编辑初稿
  const [summary, setSummary] = useState('');
  const [summarizing, setSummarizing] = useState(false);
  const runSummarize = () => {
    setSummary('');
    setSummarizing(true);
    void apiStream('/ai/summarize', { mapId: repo.mapId, nodeId: node.id }, (event, data) => {
      if (event === 'delta') setSummary((s) => s + ((data as { text?: string }).text ?? ''));
      else if (event === 'done' || event === 'error') setSummarizing(false);
    }).catch(() => setSummarizing(false));
  };

  return (
    <aside
      data-map-shortcuts="off"
      className="w-80 shrink-0 border-l border-slate-200 bg-white p-4 space-y-4 overflow-auto"
      onKeyDown={(e) => e.stopPropagation()}
      onKeyUp={(e) => e.stopPropagation()}
    >
      <div>
        <label className="text-xs text-slate-400">标题</label>
        <input
          className="w-full mt-1 px-2 py-1 rounded border border-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-300"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          onBlur={commitTitle}
          onKeyDown={(e) => {
            e.stopPropagation();
            if (e.key === 'Enter' && !e.nativeEvent.isComposing) {
              e.preventDefault();
              commitTitle();
              e.currentTarget.blur();
            }
          }}
        />
      </div>

      <div className="flex items-center justify-between">
        <label className="text-xs text-slate-400">私有节点</label>
        <button
          title={node.private ? '取消私有（软权限）' : '标记为私有（软权限，前端隐藏内容）'}
          onClick={async () => {
            if (!node.private) {
              const ok = await dialog.confirm({
                tone: 'warning',
                title: '标记为私有节点？',
                message: '无权限成员只能看到占位骨架，内容会在前端隐藏。这是软隔离。',
                confirmText: '标记为私有',
              });
              if (!ok) return;
            }
            repo.setPrivate(node.id, !node.private);
          }}
          className={`text-xs px-2 py-0.5 rounded border ${
            node.private
              ? 'bg-amber-50 border-amber-300 text-amber-700'
              : 'bg-white border-slate-200 text-slate-500 hover:border-slate-400'
          }`}
        >
          {node.private ? '🔒 私有' : '🔓 公开'}
        </button>
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
              onKeyDown={(e) => e.stopPropagation()}
              onKeyUp={(e) => e.stopPropagation()}
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

      <NodeLinksPanel repo={repo} node={node} />

      <div className="pt-2 border-t border-slate-100">
        <label className="text-xs text-slate-400">评论</label>
        <ul className="mt-1 space-y-2 max-h-48 overflow-auto">
          {comments?.items.map((c) => (
            <li
              key={c.id}
              className={`text-xs rounded p-2 border ${c.resolved ? 'opacity-50 bg-slate-50 border-slate-100' : 'bg-white border-slate-200'}`}
            >
              <div className="flex items-center justify-between mb-0.5">
                <span className="font-medium text-slate-700">{c.displayName}</span>
                <div className="flex items-center gap-1">
                  <span className="text-slate-400">{fmtTime(c.createdAt)}</span>
                  {myUserId && (
                    <button
                      title={c.resolved ? '重新打开' : '标记已解决'}
                      onClick={() => resolveComment.mutate({ id: c.id, resolved: !c.resolved })}
                      className="text-[10px] text-slate-400 hover:text-green-600"
                    >
                      {c.resolved ? '↩' : '✓'}
                    </button>
                  )}
                </div>
              </div>
              <p className="text-slate-600 whitespace-pre-wrap">{c.body}</p>
            </li>
          ))}
          {comments?.items.length === 0 && <li className="text-xs text-slate-400">暂无评论</li>}
        </ul>
        <div className="mt-2 flex gap-1">
          <input
            className="flex-1 px-2 py-1 rounded border border-slate-200 text-xs focus:outline-none focus:ring-1 focus:ring-blue-300"
            placeholder="添加评论… (Enter 发送)"
            value={commentDraft}
            onChange={(e) => setCommentDraft(e.target.value)}
            onKeyDown={(e) => {
              e.stopPropagation();
              if (e.key === 'Enter' && !e.shiftKey && commentDraft.trim()) {
                e.preventDefault();
                addComment.mutate(commentDraft.trim());
              }
            }}
          />
          <button
            className="px-2 py-1 rounded bg-blue-600 text-white text-xs disabled:opacity-50"
            disabled={!commentDraft.trim() || addComment.isPending}
            onClick={() => addComment.mutate(commentDraft.trim())}
          >
            发送
          </button>
        </div>
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
