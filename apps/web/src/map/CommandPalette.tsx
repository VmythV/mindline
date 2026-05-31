import { useEffect, useMemo, useRef, useState } from 'react';
import type { NodeView } from './types';

export interface PaletteCommand {
  id: string;
  label: string;
  hint?: string;
  run: () => void;
}

/** 命令面板（Cmd+K / Cmd+F）：搜索节点跳转 + 执行动作命令。 */
export function CommandPalette({
  nodes,
  actions,
  onJump,
  onClose,
}: {
  nodes: NodeView[];
  actions: PaletteCommand[];
  onJump: (id: string) => void;
  onClose: () => void;
}) {
  const [q, setQ] = useState('');
  const [idx, setIdx] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const items: PaletteCommand[] = useMemo(() => {
    const lower = q.toLowerCase();
    const nodeCmds: PaletteCommand[] = nodes
      .filter((n) => (n.title || '未命名').toLowerCase().includes(lower))
      .slice(0, 30)
      .map((n) => ({
        id: `node:${n.id}`,
        label: n.title || '未命名',
        hint: '跳转',
        run: () => onJump(n.id),
      }));
    const actCmds = q ? actions.filter((a) => a.label.includes(q)) : actions;
    return [...actCmds, ...nodeCmds];
  }, [q, nodes, actions, onJump]);

  useEffect(() => {
    setIdx(0);
  }, [q]);

  return (
    <div
      className="fixed inset-0 z-50 bg-black/20 flex items-start justify-center pt-32"
      onClick={onClose}
    >
      <div
        className="w-[480px] bg-white rounded-xl shadow-xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <input
          ref={inputRef}
          className="w-full px-4 py-3 border-b border-slate-100 outline-none text-sm"
          placeholder="搜索节点或命令…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'ArrowDown') {
              e.preventDefault();
              setIdx((i) => Math.min(i + 1, items.length - 1));
            } else if (e.key === 'ArrowUp') {
              e.preventDefault();
              setIdx((i) => Math.max(i - 1, 0));
            } else if (e.key === 'Enter') {
              e.preventDefault();
              items[idx]?.run();
              onClose();
            } else if (e.key === 'Escape') {
              onClose();
            }
          }}
        />
        <ul className="max-h-72 overflow-auto">
          {items.map((c, i) => (
            <li
              key={c.id}
              className={`px-4 py-2 text-sm flex justify-between items-center cursor-pointer ${
                i === idx ? 'bg-blue-50' : ''
              }`}
              onMouseEnter={() => setIdx(i)}
              onClick={() => {
                c.run();
                onClose();
              }}
            >
              <span className="truncate text-slate-700">{c.label}</span>
              {c.hint && <span className="text-xs text-slate-400 ml-2">{c.hint}</span>}
            </li>
          ))}
          {items.length === 0 && <li className="px-4 py-3 text-sm text-slate-400">无匹配</li>}
        </ul>
      </div>
    </div>
  );
}
