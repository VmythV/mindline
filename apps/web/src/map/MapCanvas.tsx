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

export function MapCanvas({
  repo,
  nodes,
  provider,
}: {
  repo: MapRepository;
  nodes: NodeView[];
  provider: HocuspocusProvider | null;
}) {
  const user = useAuth((s) => s.user);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [peers, setPeers] = useState<PeerState[]>([]);
  const [rfNodes, setRfNodes, onNodesChange] = useNodesState<Node<CardData>>([]);
  const [rfEdges, setRfEdges] = useEdgesState<Edge>([]);

  // 协作者正在编辑的节点徽标
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

  // Awareness：广播本地 user + 订阅协作者
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

  // Awareness：广播当前选中（正在编辑）节点
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
  const selectedNode = selectedId ? (nodes.find((n) => n.id === selectedId) ?? null) : null;
  const selfName = user?.displayName ?? '我';
  const selfColor = user ? colorFor(user.id) : '#888';

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
          onNodeDragStop={onNodeDragStop}
          onPaneClick={() => setSelectedId(null)}
          fitView
          proOptions={{ hideAttribution: true }}
        >
          <Background />
          <Controls />
        </ReactFlow>
      </div>
      {selectedNode && <NodeInspector key={selectedNode.id} repo={repo} node={selectedNode} />}
    </div>
  );
}
