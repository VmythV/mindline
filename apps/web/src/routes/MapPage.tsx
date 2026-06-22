import { lazy, Suspense, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { api } from '../lib/api';
import { useMapDoc } from '../map/useMapDoc';
import { MapCanvas } from '../map/MapCanvas';
import { TimelinePanel } from '../map/TimelinePanel';
import type { ProjectDetail } from '../lib/types';

// 3D 总览只读视图：three 体积较大，按需动态加载（仅切到 3D 时下载）
const Map3D = lazy(() => import('../map/Map3D'));

export function MapPage() {
  const { projectId } = useParams();
  const navigate = useNavigate();
  const [showTimeline, setShowTimeline] = useState(false);
  const [view, setView] = useState<'2d' | '3d'>('2d');
  const [layout3dMode, setLayout3dMode] = useState<'tree' | 'sphere'>('tree');
  const [focusNodeId, setFocusNodeId] = useState<string | null>(null);
  const { data: project } = useQuery({
    queryKey: ['project', projectId],
    queryFn: () => api<ProjectDetail>(`/projects/${projectId}`),
    enabled: !!projectId,
  });

  const mapId = project?.mapId ?? undefined;
  const { repo, nodes, synced, provider } = useMapDoc(mapId);

  const connecting = (
    <div className="h-full flex items-center justify-center text-slate-400">正在连接协同文档…</div>
  );

  return (
    <div className="h-screen flex flex-col bg-slate-50">
      <header className="h-14 shrink-0 bg-white border-b border-slate-100 flex items-center gap-4 px-6">
        <button className="text-slate-500 hover:text-blue-600" onClick={() => navigate('/')}>
          ← 返回
        </button>
        <span className="font-semibold text-slate-800">{project?.name ?? '加载中…'}</span>
        <span className="ml-auto text-xs text-slate-400">
          {synced ? '● 已连接' : '○ 连接中…'}
          {view === '2d'
            ? ' · Tab 建子 · Enter 建同级 · 双击/F2 改名 · Del 删除 · ⌘Z 撤销'
            : ' · 拖拽旋转 · 滚轮缩放 · 点击节点回 2D'}
        </span>
        {view === '3d' && (
          <button
            className="text-sm px-2 py-1 rounded text-slate-500 hover:text-blue-600"
            onClick={() => setLayout3dMode((m) => (m === 'tree' ? 'sphere' : 'tree'))}
          >
            {layout3dMode === 'tree' ? '◳ 分层树' : '○ 球面'}
          </button>
        )}
        <button
          className={`text-sm px-2 py-1 rounded ${view === '3d' ? 'bg-blue-50 text-blue-600' : 'text-slate-500 hover:text-blue-600'}`}
          onClick={() => setView((v) => (v === '2d' ? '3d' : '2d'))}
        >
          {view === '2d' ? '3D 总览' : '2D 编辑'}
        </button>
        <button
          className={`text-sm px-2 py-1 rounded ${showTimeline ? 'bg-blue-50 text-blue-600' : 'text-slate-500 hover:text-blue-600'}`}
          onClick={() => setShowTimeline((v) => !v)}
        >
          时间轴
        </button>
      </header>
      <div className="flex-1 min-h-0 flex">
        <div className="flex-1 min-w-0">
          {view === '3d' ? (
            synced ? (
              <Suspense
                fallback={
                  <div className="h-full flex items-center justify-center text-slate-400">
                    正在加载 3D 总览…
                  </div>
                }
              >
                <Map3D
                  nodes={nodes}
                  mode={layout3dMode}
                  onPick={(id) => {
                    setFocusNodeId(id);
                    setView('2d');
                  }}
                />
              </Suspense>
            ) : (
              connecting
            )
          ) : repo && synced ? (
            <MapCanvas
              repo={repo}
              nodes={nodes}
              provider={provider}
              projectId={projectId ?? ''}
              focusNodeId={focusNodeId}
            />
          ) : (
            connecting
          )}
        </div>
        {showTimeline && mapId && (
          <TimelinePanel
            mapId={mapId}
            projectId={projectId ?? ''}
            nodes={nodes}
            onClose={() => setShowTimeline(false)}
          />
        )}
      </div>
    </div>
  );
}
