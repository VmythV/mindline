import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '../lib/api';
import type { ChangeEventView, ChangeList } from '../lib/types';

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

export function TimelinePanel({ mapId, onClose }: { mapId: string; onClose: () => void }) {
  const { data } = useQuery({
    queryKey: ['timeline', mapId],
    queryFn: () => api<ChangeList>(`/maps/${mapId}/changes?limit=200`),
    refetchInterval: 4000,
  });
  const groups = useMemo(() => groupByBatch(data?.items ?? []), [data]);

  return (
    <aside className="w-80 shrink-0 border-l border-slate-200 bg-white flex flex-col">
      <header className="h-10 px-4 flex items-center justify-between border-b border-slate-100">
        <span className="text-sm font-medium text-slate-700">时间轴</span>
        <button className="text-slate-400 hover:text-slate-600" onClick={onClose}>
          ×
        </button>
      </header>
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
        {data && data.items.length === 0 && <li className="text-slate-400">暂无变更</li>}
      </ul>
    </aside>
  );
}
