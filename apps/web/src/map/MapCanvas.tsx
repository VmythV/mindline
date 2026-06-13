import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Background,
  Controls,
  ReactFlow,
  useEdgesState,
  useNodesState,
  type Edge,
  type Node,
  type NodeMouseHandler,
  type OnNodeDrag,
} from '@xyflow/react';
import type { HocuspocusProvider } from '@hocuspocus/provider';
import { useAuth } from '../stores/auth';
import { colorFor } from './colors';
import { layout, COL, ROW, type CardData } from './layout';
import { NodeCard, setNodeCardContext } from './NodeCard';
import { NodeInspector } from './NodeInspector';
import { CommandPalette, type PaletteCommand } from './CommandPalette';
import { ContextMenu, type ContextMenuItem } from './ContextMenu';
import { MapRepository } from './MapRepository';
import { useProposal } from './useProposal';
import { useViewFilter } from './useViewFilter';
import type { NodeView } from './types';

const nodeTypes = { card: NodeCard };
const DROP_RADIUS = 160;

interface PeerUser {
  id: string;
  name: string;
  color: string;
}
interface PeerState {
  clientId: number;
  user: PeerUser;
  editingNodeId: string | null;
}

function Avatar({ name, color, title }: { name: string; color: string; title: string }) {
  return (
    <span
      title={title}
      className="w-7 h-7 rounded-full text-xs text-white flex items-center justify-center ring-2 ring-white shadow"
      style={{ background: color }}
    >
      {name.slice(0, 1)}
    </span>
  );
}

function NodePreview({ node, onClose }: { node: NodeView; onClose: () => void }) {
  const desc = (node.data.desc as string) ?? '';
  return (
    <div
      className="fixed inset-0 z-40 bg-black/20 flex items-center justify-center"
      onClick={onClose}
    >
      <div
        className="w-[420px] max-h-[70vh] overflow-auto bg-white rounded-xl shadow-xl p-5"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="text-lg font-semibold text-slate-800">{node.title || '未命名'}</h2>
        <div className="text-xs text-slate-400 mt-1">类型：{node.type}</div>
        <div
          className="mt-3 text-sm text-slate-700"
          dangerouslySetInnerHTML={{
            __html: desc || '<p style="color:#94a3b8">（无正文）</p>',
          }}
        />
      </div>
    </div>
  );
}

export function MapCanvas({
  repo,
  nodes,
  provider,
  projectId,
}: {
  repo: MapRepository;
  nodes: NodeView[];
  provider: HocuspocusProvider | null;
  projectId: string;
}) {
  const user = useAuth((s) => s.user);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [peers, setPeers] = useState<PeerState[]>([]);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [preview, setPreview] = useState(false);
  const [ctxMenu, setCtxMenu] = useState<{ x: number; y: number; nodeId: string } | null>(null);
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [rfNodes, setRfNodes, onNodesChange] = useNodesState<Node<CardData>>([]);
  const [rfEdges, setRfEdges] = useEdgesState<Edge>([]);
  const ai = useProposal(repo);
  const viewFilter = useViewFilter(user?.id ?? '');

  const toggleCollapse = useCallback((id: string) => {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const editingPeers = new Map<string, { name: string; color: string }[]>();
  for (const p of peers) {
    if (p.editingNodeId) {
      const arr = editingPeers.get(p.editingNodeId) ?? [];
      arr.push({ name: p.user.name, color: p.user.color });
      editingPeers.set(p.editingNodeId, arr);
    }
  }
  useEffect(() => {
    if (!provider || !user) return;
    provider.setAwarenessField('user', {
      id: user.id,
      name: user.displayName,
      color: colorFor(user.id),
    });
    const aw = provider.awareness;
    if (!aw) return;
    const onChange = () => {
      const list: PeerState[] = [];
      aw.getStates().forEach((s, cid) => {
        if (cid === aw.clientID) return;
        const st = s as { user?: PeerUser; editingNodeId?: string | null };
        if (st.user)
          list.push({ clientId: cid, user: st.user, editingNodeId: st.editingNodeId ?? null });
      });
      setPeers(list);
    };
    aw.on('change', onChange);
    onChange();
    return () => aw.off('change', onChange);
  }, [provider, user]);

  useEffect(() => {
    provider?.setAwarenessField('editingNodeId', selectedId);
  }, [provider, selectedId]);

  // 计算每个节点的 effectivePrivate（继承最近祖先的 private 标记）
  const nodesWithPrivate = useMemo(() => {
    const nodeMap = new Map(nodes.map((n) => [n.id, n]));
    return nodes.map((n) => {
      if (n.private) return { ...n, effectivePrivate: true };
      let cur = nodeMap.get(n.parentId ?? '');
      while (cur) {
        if (cur.private) return { ...n, effectivePrivate: true };
        cur = nodeMap.get(cur.parentId ?? '');
      }
      return { ...n, effectivePrivate: false };
    });
  }, [nodes]);

  const filterStatus = useMemo(
    () => viewFilter.applyFilter(nodesWithPrivate),
    [nodesWithPrivate, viewFilter],
  );

  setNodeCardContext({
    onRename: (id, title) => repo.rename(id, title),
    editingId,
    setEditingId,
    editingPeers,
    onToggleCollapse: toggleCollapse,
    onTogglePrivate: (id, value) => repo.setPrivate(id, value),
    filterStatus,
    shadow: { toggle: ai.toggle, edit: ai.edit },
  });

  useEffect(() => {
    const { rfNodes: ln, rfEdges: le } = layout(nodesWithPrivate, collapsed);
    setRfNodes(ln.map((n) => ({ ...n, selected: n.id === selectedId })));
    setRfEdges(le);
  }, [nodesWithPrivate, selectedId, collapsed, setRfNodes, setRfEdges]);

  const onNodeDragStop: OnNodeDrag<Node<CardData>> = useCallback(
    (_e, dragged) => {
      let nearest: Node<CardData> | null = null;
      let min = Infinity;
      for (const n of rfNodes) {
        if (n.id === dragged.id) continue;
        if (repo.isDescendant(n.id, dragged.id)) continue;
        const d = Math.hypot(n.position.x - dragged.position.x, n.position.y - dragged.position.y);
        if (d < min) {
          min = d;
          nearest = n;
        }
      }
      if (nearest && min < DROP_RADIUS) {
        repo.moveNode(dragged.id, nearest.id);
      } else {
        const { rfNodes: ln } = layout(nodes);
        setRfNodes(ln.map((n) => ({ ...n, selected: n.id === selectedId })));
      }
    },
    [rfNodes, nodes, selectedId, repo, setRfNodes],
  );

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const active = document.activeElement;
      if (
        active &&
        (active.tagName === 'INPUT' || active.getAttribute('contenteditable') === 'true')
      )
        return;

      const mod = e.metaKey || e.ctrlKey;
      if (mod && (e.key.toLowerCase() === 'k' || e.key.toLowerCase() === 'f')) {
        e.preventDefault();
        setPaletteOpen(true);
        return;
      }
      if (mod && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        if (e.shiftKey) repo.redo();
        else repo.undo();
        return;
      }
      if (mod && e.key.toLowerCase() === 'y') {
        e.preventDefault();
        repo.redo();
        return;
      }
      if (mod && e.key === '.') {
        e.preventDefault();
        if (selectedId) toggleCollapse(selectedId);
        return;
      }

      if (!selectedId) return;

      // ↑↓←→ 节点导航（附录B）：同级上下移、← 选父、→ 选首个子（展开态）
      if (e.key.startsWith('Arrow')) {
        e.preventDefault();
        const cur = nodes.find((n) => n.id === selectedId);
        if (!cur) return;
        const sorted = (arr: NodeView[]) =>
          arr.slice().sort((a, b) => (a.order < b.order ? -1 : a.order > b.order ? 1 : 0));
        if (e.key === 'ArrowLeft') {
          if (cur.parentId) setSelectedId(cur.parentId);
        } else if (e.key === 'ArrowRight') {
          if (!collapsed.has(cur.id)) {
            const kids = sorted(nodes.filter((n) => n.parentId === cur.id));
            if (kids[0]) setSelectedId(kids[0].id);
          }
        } else {
          const sibs = sorted(nodes.filter((n) => n.parentId === cur.parentId));
          const idx = sibs.findIndex((n) => n.id === cur.id);
          const target = e.key === 'ArrowUp' ? sibs[idx - 1] : sibs[idx + 1];
          if (target) setSelectedId(target.id);
        }
        return;
      }

      if (e.key === 'Tab') {
        e.preventDefault();
        setSelectedId(repo.createChild(selectedId));
      } else if (e.key === 'Enter') {
        e.preventDefault();
        setSelectedId(repo.createSibling(selectedId));
      } else if (e.key === 'F2') {
        e.preventDefault();
        setEditingId(selectedId);
      } else if (e.key === ' ') {
        e.preventDefault();
        setPreview(true);
      } else if (e.key === 'Delete' || e.key === 'Backspace') {
        e.preventDefault();
        repo.deleteSubtree(selectedId);
        setSelectedId(null);
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [selectedId, repo, nodes, collapsed, toggleCollapse]);

  const onNodeClick: NodeMouseHandler<Node<CardData>> = (_e, node) => setSelectedId(node.id);
  const onNodeContextMenu: NodeMouseHandler<Node<CardData>> = (e, node) => {
    e.preventDefault();
    setSelectedId(node.id);
    setCtxMenu({ x: e.clientX, y: e.clientY, nodeId: node.id });
  };

  const selectedNode = selectedId ? (nodesWithPrivate.find((n) => n.id === selectedId) ?? null) : null;
  const selfName = user?.displayName ?? '我';
  const selfColor = user ? colorFor(user.id) : '#888';

  const startDecompose = (nodeId: string) => {
    const p = window.prompt('AI 拆解 · 补充要求（可留空；点取消则不拆解）');
    if (p === null) return;
    ai.start({ nodeId, prompt: p || undefined });
  };

  // 虚影节点/边（AI 提案预览，本地态，不进 Y.Doc）；挂在 anchor 右侧
  const shadowNodes = useMemo<Node<CardData>[]>(() => {
    const p = ai.proposal;
    if (!p) return [];
    const anchor = rfNodes.find((n) => n.id === p.anchorNodeId);
    const base = anchor?.position ?? { x: 0, y: 0 };
    return p.ops.map((op, i) => ({
      id: `shadow-${op.tempId}`,
      position: { x: base.x + COL, y: base.y + (i - (p.ops.length - 1) / 2) * ROW },
      data: {
        node: {
          id: op.tempId,
          parentId: p.anchorNodeId,
          order: '',
          type: op.node?.type ?? 'idea',
          title: ai.edits[op.tempId] ?? op.node?.title ?? '',
          data: {},
        },
        shadow: {
          tempId: op.tempId,
          accepted: !!ai.decisions[op.tempId],
          valid: op.valid,
          issues: op.issues,
        },
      },
      type: 'card',
      draggable: false,
      selectable: false,
    }));
  }, [ai.proposal, ai.decisions, ai.edits, rfNodes]);

  const shadowEdges = useMemo<Edge[]>(() => {
    const p = ai.proposal;
    if (!p) return [];
    return p.ops.map((op) => ({
      id: `se-${op.tempId}`,
      source: p.anchorNodeId,
      target: `shadow-${op.tempId}`,
      type: 'smoothstep',
      animated: true,
      style: { stroke: '#cbd5e1', strokeDasharray: '4 4' },
    }));
  }, [ai.proposal]);

  const paletteActions: PaletteCommand[] = selectedId
    ? [
        {
          id: 'child',
          label: '＋ 新建子节点',
          hint: 'Tab',
          run: () => setSelectedId(repo.createChild(selectedId)),
        },
        {
          id: 'sibling',
          label: '＋ 新建同级节点',
          hint: 'Enter',
          run: () => setSelectedId(repo.createSibling(selectedId)),
        },
        { id: 'rename', label: '✎ 重命名选中', hint: 'F2', run: () => setEditingId(selectedId) },
        {
          id: 'decompose',
          label: '🤖 AI 拆解此节点',
          hint: '',
          run: () => startDecompose(selectedId),
        },
        {
          id: 'delete',
          label: '🗑 删除选中（含子树）',
          hint: 'Del',
          run: () => {
            repo.deleteSubtree(selectedId);
            setSelectedId(null);
          },
        },
      ]
    : [];

  const ctxItems = (nodeId: string): ContextMenuItem[] => [
    { label: '新建子节点', run: () => setSelectedId(repo.createChild(nodeId)) },
    { label: '新建同级节点', run: () => setSelectedId(repo.createSibling(nodeId)) },
    {
      label: '重命名',
      run: () => {
        setSelectedId(nodeId);
        setEditingId(nodeId);
      },
    },
    { label: '🤖 AI 拆解', run: () => startDecompose(nodeId) },
    {
      label: '删除（含子树）',
      danger: true,
      run: () => {
        repo.deleteSubtree(nodeId);
        if (selectedId === nodeId) setSelectedId(null);
      },
    },
  ];

  return (
    <div className="h-full flex">
      <div className="flex-1 min-w-0 relative">
        <div className="absolute top-3 right-3 z-10 flex -space-x-2">
          <Avatar name={selfName} color={selfColor} title={`${selfName}（我）`} />
          {peers.map((p) => (
            <Avatar key={p.clientId} name={p.user.name} color={p.user.color} title={p.user.name} />
          ))}
        </div>

        {/* 视图过滤工具栏 */}
        <div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-10 flex items-center gap-1 bg-white/90 backdrop-blur border border-slate-200 rounded-full px-3 py-1.5 shadow text-xs">
          <button
            title="只看我的节点"
            onClick={viewFilter.toggleOnlyMe}
            className={`px-2 py-0.5 rounded-full transition-colors ${
              viewFilter.filter.onlyMe
                ? 'bg-blue-600 text-white'
                : 'text-slate-600 hover:bg-slate-100'
            }`}
          >
            只看我的
          </button>
          {viewFilter.isActive && (
            <button
              title="清除过滤"
              onClick={viewFilter.reset}
              className="px-2 py-0.5 rounded-full text-slate-400 hover:text-slate-700 hover:bg-slate-100"
            >
              × 清除
            </button>
          )}
          {!viewFilter.isActive && (
            <span className="text-slate-300 select-none">过滤</span>
          )}
        </div>
        {ai.proposal && (
          <div className="absolute top-3 left-1/2 -translate-x-1/2 z-20 bg-white shadow-lg rounded-lg border border-slate-200 px-3 py-2 flex items-center gap-2 text-xs">
            <span className="text-slate-600">
              🤖 拆解预览 {ai.proposal.ops.length} 项{ai.running ? ' · 生成中…' : ''}
              {ai.error ? ` · ${ai.error}` : ''}
            </span>
            <button
              className="px-2 py-0.5 rounded bg-slate-100 hover:bg-slate-200"
              onClick={() => ai.proposal!.ops.forEach((o) => ai.toggle(o.tempId, true))}
            >
              全选
            </button>
            <button
              className="px-2 py-0.5 rounded bg-slate-100 hover:bg-slate-200"
              onClick={() => ai.proposal!.ops.forEach((o) => ai.toggle(o.tempId, false))}
            >
              全不选
            </button>
            <button
              className="px-2 py-0.5 rounded bg-blue-500 text-white hover:bg-blue-600"
              onClick={() => {
                const ids = ai.apply();
                if (ids[0]) setSelectedId(ids[0]);
              }}
            >
              写入
            </button>
            <button
              className="px-2 py-0.5 rounded text-slate-400 hover:text-slate-600"
              onClick={ai.clear}
            >
              取消
            </button>
          </div>
        )}
        <ReactFlow
          nodes={[...rfNodes, ...shadowNodes]}
          edges={[...rfEdges, ...shadowEdges]}
          onNodesChange={onNodesChange}
          nodeTypes={nodeTypes}
          onNodeClick={onNodeClick}
          onNodeContextMenu={onNodeContextMenu}
          onNodeDragStop={onNodeDragStop}
          onPaneClick={() => setSelectedId(null)}
          fitView
          // M0.7 视口虚拟化：仅挂载视口内 + 缓冲区的节点 DOM，大图（1000 节点）维持 ≥30FPS
          onlyRenderVisibleElements
          proOptions={{ hideAttribution: true }}
        >
          <Background />
          <Controls />
        </ReactFlow>
      </div>
      {selectedNode && (
        <NodeInspector
          key={selectedNode.id}
          repo={repo}
          node={selectedNode}
          projectId={projectId}
          myUserId={user?.id}
        />
      )}

      {paletteOpen && (
        <CommandPalette
          nodes={nodes}
          actions={paletteActions}
          onJump={(id) => setSelectedId(id)}
          onClose={() => setPaletteOpen(false)}
        />
      )}
      {ctxMenu && (
        <ContextMenu
          x={ctxMenu.x}
          y={ctxMenu.y}
          items={ctxItems(ctxMenu.nodeId)}
          onClose={() => setCtxMenu(null)}
        />
      )}
      {preview && selectedNode && (
        <NodePreview node={selectedNode} onClose={() => setPreview(false)} />
      )}
    </div>
  );
}
