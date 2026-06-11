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
  onToggleCollapse?: (id: string) => void;
  onTogglePrivate?: (id: string, value: boolean) => void;
  filterStatus?: Map<string, 'normal' | 'path' | 'hidden'>;
  shadow?: {
    toggle: (tempId: string, accept: boolean) => void;
    edit: (tempId: string, title: string) => void;
  };
}

let ctx: NodeCardContext | null = null;
/** 由 MapCanvas 注入命令回调与协作者状态（避免逐节点传递）。 */
export function setNodeCardContext(c: NodeCardContext) {
  ctx = c;
}

function NodeCardImpl({ id, data, selected }: NodeProps) {
  const cardData = data as CardData;
  const node = cardData.node;
  const shadow = cardData.shadow;

  // 虚影（AI 提案预览）：半透明虚线 + ✓/✗ 角标 + 标题就地编辑；不进 Y.Doc
  if (shadow) {
    const accepted = shadow.accepted;
    return (
      <div
        className={`relative px-3 py-2 rounded-lg border-2 border-dashed text-sm min-w-[120px] max-w-[220px] ${
          accepted
            ? 'border-emerald-400 bg-emerald-50/70'
            : 'border-slate-300 bg-white/50 opacity-60'
        }`}
      >
        <Handle type="target" position={Position.Left} className="!bg-slate-300" />
        <input
          className="w-full bg-transparent outline-none text-slate-700"
          defaultValue={node.title}
          onChange={(e) => ctx?.shadow?.edit(shadow.tempId, e.target.value)}
          onKeyDown={(e) => e.stopPropagation()}
        />
        {shadow.issues.length > 0 && (
          <div className="text-[10px] text-amber-500 truncate" title={shadow.issues.join('；')}>
            ⚠ {shadow.issues[0]}
          </div>
        )}
        <div className="absolute -top-2 -right-1 flex gap-0.5">
          <button
            title="接受"
            onClick={() => ctx?.shadow?.toggle(shadow.tempId, true)}
            className={`w-4 h-4 rounded-full text-[9px] text-white flex items-center justify-center ${accepted ? 'bg-emerald-500' : 'bg-slate-300'}`}
          >
            ✓
          </button>
          <button
            title="拒绝"
            onClick={() => ctx?.shadow?.toggle(shadow.tempId, false)}
            className={`w-4 h-4 rounded-full text-[9px] text-white flex items-center justify-center ${!accepted ? 'bg-rose-500' : 'bg-slate-300'}`}
          >
            ✗
          </button>
        </div>
      </div>
    );
  }

  const filterStatus = ctx?.filterStatus?.get(id) ?? 'normal';
  const isPrivate = node.effectivePrivate ?? node.private ?? false;

  // 路径节点（过滤时的骨架占位）：半透明 + 仅标题
  if (filterStatus === 'path') {
    return (
      <div className="relative px-3 py-2 rounded-lg border border-dashed border-slate-300 bg-slate-50/60 opacity-50 text-sm min-w-[120px] max-w-[220px]">
        <Handle type="target" position={Position.Left} className="!bg-slate-300" />
        <span className="block truncate text-slate-500 italic">{node.title || '未命名'}</span>
        <Handle type="source" position={Position.Right} className="!bg-slate-300" />
      </div>
    );
  }

  // 私有节点骨架（软权限 §3.2）：结构可见，内容隐藏
  if (isPrivate) {
    return (
      <div
        className={`relative px-3 py-2 rounded-lg border bg-slate-100 shadow-sm text-sm min-w-[120px] max-w-[220px] ${
          selected ? 'border-blue-400 ring-2 ring-blue-100' : 'border-slate-300'
        }`}
      >
        <Handle type="target" position={Position.Left} className="!bg-slate-300" />
        <span className="block truncate text-slate-400">🔒 受限节点</span>
        <Handle type="source" position={Position.Right} className="!bg-slate-300" />
      </div>
    );
  }

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
      {/* 私有标记徽标 */}
      {(node.private) && (
        <span className="absolute top-0.5 left-0.5 text-[9px] text-slate-400" title="此节点已标记为私有">🔒</span>
      )}
      <Handle type="source" position={Position.Right} className="!bg-slate-300" />

      {/* 折叠柄：折叠态显示 ▸N（隐藏的直接子节点数），点击等价 Cmd+. */}
      {(cardData.childCount ?? 0) > 0 && (
        <button
          title={cardData.collapsed ? '展开子树' : '折叠子树'}
          onClick={(e) => {
            e.stopPropagation();
            ctx?.onToggleCollapse?.(id);
          }}
          className="absolute top-1/2 -right-3 -translate-y-1/2 px-1 h-4 rounded bg-slate-100 hover:bg-slate-200 text-[9px] leading-4 text-slate-500"
        >
          {cardData.collapsed ? `▸${cardData.childCount}` : '▾'}
        </button>
      )}

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
