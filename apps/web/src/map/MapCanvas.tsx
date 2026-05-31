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
import { layout, type CardData } from './layout';
import { NodeCard, setNodeCardContext } from './NodeCard';
import { NodeInspector } from './NodeInspector';
import { MapRepository } from './MapRepository';
import type { NodeView } from './types';

const nodeTypes = { card: NodeCard };
const DROP_RADIUS = 160;

export function MapCanvas({ repo, nodes }: { repo: MapRepository; nodes: NodeView[] }) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [rfNodes, setRfNodes, onNodesChange] = useNodesState<Node<CardData>>([]);
  const [rfEdges, setRfEdges] = useEdgesState<Edge>([]);

  setNodeCardContext({
    onRename: (id, title) => repo.rename(id, title),
    editingId,
    setEditingId,
  });

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

  return (
    <div className="h-full flex">
      <div className="flex-1 min-w-0">
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
