import { useCallback, useEffect, useState } from 'react';
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
import { layout, type CardData } from './layout';
import { NodeCard, setNodeCardContext } from './NodeCard';
import { NodeInspector } from './NodeInspector';
import { CommandPalette, type PaletteCommand } from './CommandPalette';
import { ContextMenu, type ContextMenuItem } from './ContextMenu';
import { MapRepository } from './MapRepository';
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
  const [rfNodes, setRfNodes, onNodesChange] = useNodesState<Node<CardData>>([]);
  const [rfEdges, setRfEdges] = useEdgesState<Edge>([]);

  const editingPeers = new Map<string, { name: string; color: string }[]>();
  for (const p of peers) {
    if (p.editingNodeId) {
      const arr = editingPeers.get(p.editingNodeId) ?? [];
      arr.push({ name: p.user.name, color: p.user.color });
      editingPeers.set(p.editingNodeId, arr);
    }
  }
  setNodeCardContext({
    onRename: (id, title) => repo.rename(id, title),
    editingId,
    setEditingId,
    editingPeers,
  });

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
        if (st.user) list.push({ clientId: cid, user: st.user, editingNodeId: st.editingNodeId ?? null });
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

  useEffect(() => {
    const { rfNodes: ln, rfEdges: le } = layout(nodes);
    setRfNodes(ln.map((n) => ({ ...n, selected: n.id === selectedId })));
    setRfEdges(le);
  }, [nodes, selectedId, setRfNodes, setRfEdges]);

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

      if (!selectedId) return;

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
  }, [selectedId, repo]);

  const onNodeClick: NodeMouseHandler<Node<CardData>> = (_e, node) => setSelectedId(node.id);
  const onNodeContextMenu: NodeMouseHandler<Node<CardData>> = (e, node) => {
    e.preventDefault();
    setSelectedId(node.id);
    setCtxMenu({ x: e.clientX, y: e.clientY, nodeId: node.id });
  };

  const selectedNode = selectedId ? (nodes.find((n) => n.id === selectedId) ?? null) : null;
  const selfName = user?.displayName ?? '我';
  const selfColor = user ? colorFor(user.id) : '#888';

  const paletteActions: PaletteCommand[] = selectedId
    ? [
        { id: 'child', label: '＋ 新建子节点', hint: 'Tab', run: () => setSelectedId(repo.createChild(selectedId)) },
        { id: 'sibling', label: '＋ 新建同级节点', hint: 'Enter', run: () => setSelectedId(repo.createSibling(selectedId)) },
        { id: 'rename', label: '✎ 重命名选中', hint: 'F2', run: () => setEditingId(selectedId) },
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
    { label: '重命名', run: () => { setSelectedId(nodeId); setEditingId(nodeId); } },
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
        <ReactFlow
          nodes={rfNodes}
          edges={rfEdges}
          onNodesChange={onNodesChange}
          nodeTypes={nodeTypes}
          onNodeClick={onNodeClick}
          onNodeContextMenu={onNodeContextMenu}
          onNodeDragStop={onNodeDragStop}
          onPaneClick={() => setSelectedId(null)}
          fitView
          proOptions={{ hideAttribution: true }}
        >
          <Background />
          <Controls />
        </ReactFlow>
      </div>
      {selectedNode && (
        <NodeInspector key={selectedNode.id} repo={repo} node={selectedNode} projectId={projectId} />
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
