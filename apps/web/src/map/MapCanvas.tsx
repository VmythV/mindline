import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Background,
  BackgroundVariant,
  ControlButton,
  Controls,
  ReactFlow,
  useEdgesState,
  useNodesState,
  type Edge,
  type Node,
  type NodeMouseHandler,
  type OnNodeDrag,
  type ReactFlowInstance,
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
import { useDialog } from '../ui/DialogProvider';

const nodeTypes = { card: NodeCard };
const DROP_RADIUS = 160;
const EDGE_THEMES = {
  ocean: {
    label: '海洋',
    colors: ['#2563eb', '#0891b2', '#0d9488', '#65a30d'],
    background: '#eff6ff',
  },
  forest: {
    label: '森林',
    colors: ['#15803d', '#4d7c0f', '#0f766e', '#a16207'],
    background: '#f0fdf4',
  },
  sunset: {
    label: '日落',
    colors: ['#dc2626', '#ea580c', '#d97706', '#be123c'],
    background: '#fff7ed',
  },
  slate: {
    label: '石板',
    colors: ['#475569', '#64748b', '#0f766e', '#7c3aed'],
    background: '#f8fafc',
  },
} as const;
type EdgeThemeKey = keyof typeof EDGE_THEMES;
type EdgeColorMode = 'single' | 'varied';
type CanvasMode = 'dots' | 'plain';

function shouldIgnoreMapShortcut(active: Element | null): boolean {
  if (!(active instanceof HTMLElement)) return false;
  return !!active.closest(
    'input, textarea, select, button, [contenteditable="true"], .ProseMirror, [data-map-shortcuts="off"]',
  );
}

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
  focusNodeId,
}: {
  repo: MapRepository;
  nodes: NodeView[];
  provider: HocuspocusProvider | null;
  projectId: string;
  /** 外部请求聚焦的节点（如从 3D 总览下钻回 2D）。 */
  focusNodeId?: string | null;
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
  const [rfInstance, setRfInstance] = useState<ReactFlowInstance<Node<CardData>, Edge> | null>(
    null,
  );
  const [pendingFocusId, setPendingFocusId] = useState<string | null>(null);
  const [recentIds, setRecentIds] = useState<Set<string>>(new Set());
  const [edgeTheme, setEdgeTheme] = useState<EdgeThemeKey>('ocean');
  const [edgeColorMode, setEdgeColorMode] = useState<EdgeColorMode>('varied');
  const [canvasMode, setCanvasMode] = useState<CanvasMode>('dots');
  const dialog = useDialog();

  // 外部下钻聚焦（如 3D 总览点击节点回 2D）：选中并触发居中（复用 pendingFocusId → setCenter）
  useEffect(() => {
    if (!focusNodeId) return;
    setSelectedId(focusNodeId);
    setPendingFocusId(focusNodeId);
  }, [focusNodeId]);
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
    const childrenByParent = new Map<string, typeof nodesWithPrivate>();
    for (const node of nodesWithPrivate) {
      const parentKey = node.parentId ?? '__root__';
      const children = childrenByParent.get(parentKey) ?? [];
      children.push(node);
      childrenByParent.set(parentKey, children);
    }
    const siblingIndexById = new Map<string, number>();
    for (const children of childrenByParent.values()) {
      children
        .slice()
        .sort((a, b) => (a.order < b.order ? -1 : a.order > b.order ? 1 : 0))
        .forEach((node, index) => siblingIndexById.set(node.id, index));
    }
    const theme = EDGE_THEMES[edgeTheme];
    setRfNodes(
      ln.map((n) => ({
        ...n,
        selected: n.id === selectedId,
        data: { ...n.data, recent: recentIds.has(n.id) },
      })),
    );
    setRfEdges(
      le.map((e) => {
        const targetSiblingIndex = siblingIndexById.get(e.target) ?? 0;
        const stroke =
          edgeColorMode === 'single'
            ? theme.colors[0]
            : theme.colors[targetSiblingIndex % theme.colors.length];
        return {
          ...e,
          style: { stroke, strokeWidth: 2 },
        };
      }),
    );
  }, [
    nodesWithPrivate,
    selectedId,
    collapsed,
    setRfNodes,
    setRfEdges,
    edgeTheme,
    edgeColorMode,
    recentIds,
  ]);

  useEffect(() => {
    if (!pendingFocusId || !rfInstance) return;
    const node = rfNodes.find((n) => n.id === pendingFocusId);
    if (!node) return;
    setPendingFocusId(null);
    void rfInstance.setCenter(node.position.x + 90, node.position.y + 28, {
      zoom: 1.1,
      duration: 260,
    });
  }, [pendingFocusId, rfInstance, rfNodes]);

  const focusCreatedNode = useCallback((id: string) => {
    setSelectedId(id);
    setEditingId(id);
    setPendingFocusId(id);
    setRecentIds((prev) => new Set(prev).add(id));
    window.setTimeout(() => {
      setRecentIds((prev) => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
    }, 520);
  }, []);

  const createChildAndFocus = useCallback(
    (parentId: string) => {
      focusCreatedNode(repo.createChild(parentId));
    },
    [focusCreatedNode, repo],
  );

  const createSiblingAndFocus = useCallback(
    (nodeId: string) => {
      focusCreatedNode(repo.createSibling(nodeId));
    },
    [focusCreatedNode, repo],
  );

  const fitCanvas = useCallback(() => {
    void rfInstance?.fitView({ padding: 0.16, duration: 280, includeHiddenNodes: false });
  }, [rfInstance]);

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
      if (shouldIgnoreMapShortcut(active)) return;

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
        createChildAndFocus(selectedId);
      } else if (e.key === 'Enter') {
        e.preventDefault();
        createSiblingAndFocus(selectedId);
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
  }, [
    selectedId,
    repo,
    nodes,
    collapsed,
    toggleCollapse,
    createChildAndFocus,
    createSiblingAndFocus,
  ]);

  const onNodeClick: NodeMouseHandler<Node<CardData>> = (_e, node) => setSelectedId(node.id);
  const onNodeContextMenu: NodeMouseHandler<Node<CardData>> = (e, node) => {
    e.preventDefault();
    setSelectedId(node.id);
    setCtxMenu({ x: e.clientX, y: e.clientY, nodeId: node.id });
  };

  const selectedNode = selectedId
    ? (nodesWithPrivate.find((n) => n.id === selectedId) ?? null)
    : null;
  const selfName = user?.displayName ?? '我';
  const selfColor = user ? colorFor(user.id) : '#888';

  const startDecompose = async (nodeId: string) => {
    const p = await dialog.prompt({
      tone: 'info',
      title: 'AI 拆解',
      message: '补充要求可留空；取消则不拆解。',
      placeholder: '例如：按执行步骤拆成 5 个子节点',
      confirmText: '开始拆解',
    });
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
      style: { stroke: '#cbd5e1', strokeDasharray: '4 4' },
    }));
  }, [ai.proposal]);

  const paletteActions: PaletteCommand[] = selectedId
    ? [
        {
          id: 'child',
          label: '＋ 新建子节点',
          hint: 'Tab',
          run: () => createChildAndFocus(selectedId),
        },
        {
          id: 'sibling',
          label: '＋ 新建同级节点',
          hint: 'Enter',
          run: () => createSiblingAndFocus(selectedId),
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
    { label: '新建子节点', run: () => createChildAndFocus(nodeId) },
    { label: '新建同级节点', run: () => createSiblingAndFocus(nodeId) },
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
        <div
          className="absolute top-3 left-3 z-10 flex items-center gap-2 bg-white/90 backdrop-blur border border-slate-200 rounded-lg px-2 py-1 shadow text-xs"
          data-map-shortcuts="off"
        >
          <label className="text-slate-400">线条</label>
          <select
            className="bg-transparent text-slate-700 outline-none"
            value={edgeColorMode}
            onChange={(e) => setEdgeColorMode(e.target.value as EdgeColorMode)}
          >
            <option value="varied">多色</option>
            <option value="single">单色</option>
          </select>
          <select
            className="bg-transparent text-slate-700 outline-none"
            value={edgeTheme}
            onChange={(e) => setEdgeTheme(e.target.value as EdgeThemeKey)}
          >
            {Object.entries(EDGE_THEMES).map(([key, theme]) => (
              <option key={key} value={key}>
                {theme.label}
              </option>
            ))}
          </select>
          <span className="h-4 w-px bg-slate-200" />
          <label className="text-slate-400">画布</label>
          <select
            className="bg-transparent text-slate-700 outline-none"
            value={canvasMode}
            onChange={(e) => setCanvasMode(e.target.value as CanvasMode)}
          >
            <option value="dots">点阵</option>
            <option value="plain">纯白</option>
          </select>
        </div>
        <div className="absolute top-3 right-3 z-10 flex -space-x-2">
          <Avatar name={selfName} color={selfColor} title={`${selfName}（我）`} />
          {peers.map((p) => (
            <Avatar key={p.clientId} name={p.user.name} color={p.user.color} title={p.user.name} />
          ))}
        </div>

        {/* 视图过滤工具栏 */}
        <div
          className="absolute bottom-4 left-16 z-10 flex items-center gap-1 bg-white/90 backdrop-blur border border-slate-200 rounded-full px-3 py-1.5 shadow text-xs"
          data-map-shortcuts="off"
        >
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
          {!viewFilter.isActive && <span className="text-slate-300 select-none">过滤</span>}
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
                if (ids[0]) focusCreatedNode(ids[0]);
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
          onInit={setRfInstance}
          fitView
          fitViewOptions={{ padding: 0.16, includeHiddenNodes: false }}
          minZoom={0.05}
          maxZoom={4}
          // M0.7 视口虚拟化：仅挂载视口内 + 缓冲区的节点 DOM，大图（1000 节点）维持 ≥30FPS
          onlyRenderVisibleElements
          proOptions={{ hideAttribution: true }}
          style={{
            background: canvasMode === 'plain' ? '#ffffff' : EDGE_THEMES[edgeTheme].background,
          }}
        >
          {canvasMode === 'dots' && (
            <Background
              color={EDGE_THEMES[edgeTheme].colors[0]}
              variant={BackgroundVariant.Dots}
              gap={18}
              size={1.2}
            />
          )}
          <Controls showFitView={false} fitViewOptions={{ padding: 0.16 }}>
            <ControlButton title="适应画布" aria-label="适应画布" onClick={fitCanvas}>
              ⤢
            </ControlButton>
          </Controls>
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
