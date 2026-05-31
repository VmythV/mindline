import { useEffect, useMemo, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '../lib/api';
import type { ChangeEventView, ChangeList } from '../lib/types';
import type { NodeView } from './types';
import { MilestonesSection } from './MilestonesSection';

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

const RANGES: { key: string; label: string; ms: number }[] = [
  { key: 'all', label: '全部时间', ms: 0 },
  { key: '1d', label: '近 1 天', ms: 86_400_000 },
  { key: '7d', label: '近 7 天', ms: 7 * 86_400_000 },
  { key: '30d', label: '近 30 天', ms: 30 * 86_400_000 },
];

function fmtTime(ts: number): string {
  const d = new Date(ts);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getMonth() + 1}/${d.getDate()} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

interface Group {
  key: string;
  batchId: string | null;
  items: ChangeEventView[];
}

/** 连续同 batchId 折叠为一条批量事件（如一次 AI 拆解 / 删子树 / 迁移）。 */
function groupByBatch(items: ChangeEventView[]): Group[] {
  const groups: Group[] = [];
  for (const c of items) {
    const last = groups[groups.length - 1];
    if (c.batchId && last && last.batchId === c.batchId) {
      last.items.push(c);
    } else {
      groups.push({ key: c.id, batchId: c.batchId, items: [c] });
    }
  }
  return groups;
}

const selCls =
  'border border-slate-200 rounded px-1.5 py-1 text-xs text-slate-600 bg-white max-w-full';

export function TimelinePanel({
  mapId,
  projectId,
  nodes,
  onClose,
}: {
  mapId: string;
  projectId: string;
  nodes?: NodeView[];
  onClose: () => void;
}) {
  const [actor, setActor] = useState('');
  const [op, setOp] = useState('');
  const [branch, setBranch] = useState('');
  const [range, setRange] = useState('all');

  const query = useMemo(() => {
    const p = new URLSearchParams({ limit: '200' });
    if (actor) p.set('actor', actor);
    if (op) p.set('op', op);
    if (branch) p.set('branch', branch);
    const r = RANGES.find((x) => x.key === range);
    if (r && r.ms > 0) p.set('from', String(Date.now() - r.ms));
    return p.toString();
  }, [actor, op, branch, range]);

  const { data } = useQuery({
    queryKey: ['timeline', mapId, actor, op, branch, range],
    queryFn: () => api<ChangeList>(`/maps/${mapId}/changes?${query}`),
    refetchInterval: 4000,
  });
  const groups = useMemo(() => groupByBatch(data?.items ?? []), [data]);

  // 累积见过的操作人，避免选定某人后下拉丢失其他人选项
  const seenActors = useRef<Map<string, string>>(new Map());
  useEffect(() => {
    for (const it of data?.items ?? []) seenActors.current.set(it.actorId, it.actorName);
  }, [data]);
  const actorOptions = Array.from(seenActors.current.entries());

  const branchOptions = useMemo(
    () => [...(nodes ?? [])].sort((a, b) => a.title.localeCompare(b.title)),
    [nodes],
  );
  const filtered = !!(actor || op || branch || range !== 'all');

  return (
    <aside className="w-80 shrink-0 border-l border-slate-200 bg-white flex flex-col">
      <header className="h-10 px-4 flex items-center justify-between border-b border-slate-100">
        <span className="text-sm font-medium text-slate-700">时间轴</span>
        <button className="text-slate-400 hover:text-slate-600" onClick={onClose}>
          ×
        </button>
      </header>

      <MilestonesSection projectId={projectId} nodes={nodes} />

      <div className="px-3 py-2 border-b border-slate-100 grid grid-cols-2 gap-1.5">
        <select className={selCls} value={actor} onChange={(e) => setActor(e.target.value)}>
          <option value="">全部成员</option>
          {actorOptions.map(([id, name]) => (
            <option key={id} value={id}>
              {name}
            </option>
          ))}
        </select>
        <select className={selCls} value={op} onChange={(e) => setOp(e.target.value)}>
          <option value="">全部操作</option>
          {Object.entries(OP_LABEL).map(([k, label]) => (
            <option key={k} value={k}>
              {label}
            </option>
          ))}
        </select>
        <select className={selCls} value={range} onChange={(e) => setRange(e.target.value)}>
          {RANGES.map((r) => (
            <option key={r.key} value={r.key}>
              {r.label}
            </option>
          ))}
        </select>
        <select className={selCls} value={branch} onChange={(e) => setBranch(e.target.value)}>
          <option value="">全部分支</option>
          {branchOptions.map((n) => (
            <option key={n.id} value={n.id}>
              {n.title || '(未命名)'}
            </option>
          ))}
        </select>
        {filtered && (
          <button
            className="col-span-2 text-xs text-slate-400 hover:text-blue-600 text-left"
            onClick={() => {
              setActor('');
              setOp('');
              setBranch('');
              setRange('all');
            }}
          >
            清除筛选
          </button>
        )}
      </div>

      <ul className="flex-1 overflow-auto p-3 space-y-2 text-xs">
        {groups.map((g) => {
          const head = g.items[0]!;
          const batched = g.items.length > 1;
          return (
            <li key={g.key} className="border-l-2 border-blue-200 pl-2">
              <div>
                <span className="font-medium text-slate-700">
                  {batched
                    ? `批量${OP_LABEL[head.op] ?? head.op}（${g.items.length} 项）`
                    : (OP_LABEL[head.op] ?? head.op)}
                </span>
                {!batched && head.field && <span className="text-slate-500"> · {head.field}</span>}
                <span className="text-slate-400">
                  {' '}
                  · {head.actorName} · {fmtTime(head.ts)}
                </span>
              </div>
              {!batched && head.op === 'rename' && (
                <div className="text-slate-400 truncate">
                  {String(head.before ?? '')} → {String(head.after ?? '')}
                </div>
              )}
            </li>
          );
        })}
        {data && data.items.length === 0 && (
          <li className="text-slate-400">{filtered ? '无匹配的变更' : '暂无变更'}</li>
        )}
      </ul>
    </aside>
  );
}
