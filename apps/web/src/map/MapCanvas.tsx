import { useEffect, useMemo, useState } from 'react';
import {
  Background,
  Controls,
  ReactFlow,
  type Node,
  type NodeMouseHandler,
} from '@xyflow/react';
import { layout, type CardData } from './layout';
import { NodeCard, setNodeCardContext } from './NodeCard';
import { MapRepository } from './MapRepository';
import type { NodeView } from './types';

const nodeTypes = { card: NodeCard };

export function MapCanvas({ repo, nodes }: { repo: MapRepository; nodes: NodeView[] }) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);

  // 注入命令上下文给节点卡片
  setNodeCardContext({
    onRename: (id, title) => repo.rename(id, title),
    editingId,
    setEditingId,
  });

  const { rfNodes, rfEdges } = useMemo(() => layout(nodes), [nodes]);
  const styledNodes: Node<CardData>[] = rfNodes.map((n) => ({ ...n, selected: n.id === selectedId }));

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const active = document.activeElement;
      if (active && active.tagName === 'INPUT') return; // 编辑中不触发
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

  const onNodeClick: NodeMouseHandler = (_e, node) => setSelectedId(node.id);

  return (
    <ReactFlow
      nodes={styledNodes}
      edges={rfEdges}
      nodeTypes={nodeTypes}
      onNodeClick={onNodeClick}
      onPaneClick={() => setSelectedId(null)}
      fitView
      proOptions={{ hideAttribution: true }}
    >
      <Background />
      <Controls />
    </ReactFlow>
  );
}
