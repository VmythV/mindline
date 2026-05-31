import { memo, useEffect, useRef, useState } from 'react';
import { Handle, Position, type NodeProps } from '@xyflow/react';
import type { CardData } from './layout';

interface PeerBadge {
  name: string;
  color: string;
}

interface NodeCardContext {
  onRename: (id: string, title: string) => void;
  editingId: string | null;
  setEditingId: (id: string | null) => void;
  editingPeers: Map<string, PeerBadge[]>;
}

let ctx: NodeCardContext | null = null;
/** 由 MapCanvas 注入命令回调与协作者状态（避免逐节点传递）。 */
export function setNodeCardContext(c: NodeCardContext) {
  ctx = c;
}

function NodeCardImpl({ id, data, selected }: NodeProps) {
  const node = (data as CardData).node;
  const editing = ctx?.editingId === id;
  const peers = ctx?.editingPeers.get(id) ?? [];
  const [draft, setDraft] = useState(node.title);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editing) {
      setDraft(node.title);
      inputRef.current?.focus();
      inputRef.current?.select();
    }
  }, [editing, node.title]);

  function commit() {
    ctx?.onRename(id, draft.trim() || '未命名');
    ctx?.setEditingId(null);
  }

  return (
    <div
      className={`relative px-3 py-2 rounded-lg border bg-white shadow-sm text-sm min-w-[120px] max-w-[220px] ${
        selected ? 'border-blue-500 ring-2 ring-blue-200' : 'border-slate-200'
      }`}
      onDoubleClick={() => ctx?.setEditingId(id)}
    >
      <Handle type="target" position={Position.Left} className="!bg-slate-300" />
      {editing ? (
        <input
          ref={inputRef}
          className="w-full outline-none"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => {
            e.stopPropagation();
            if (e.key === 'Enter') commit();
            else if (e.key === 'Escape') ctx?.setEditingId(null);
          }}
        />
      ) : (
        <span className="block truncate text-slate-800">{node.title || '未命名'}</span>
      )}
      <Handle type="source" position={Position.Right} className="!bg-slate-300" />

      {peers.length > 0 && (
        <div className="absolute -top-2 -right-1 flex -space-x-1">
          {peers.map((p, i) => (
            <span
              key={i}
              title={`${p.name} 正在编辑`}
              className="w-4 h-4 rounded-full text-[8px] text-white flex items-center justify-center ring-1 ring-white"
              style={{ background: p.color }}
            >
              {p.name.slice(0, 1)}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

export const NodeCard = memo(NodeCardImpl);
