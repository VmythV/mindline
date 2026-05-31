import { useNavigate, useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { api } from '../lib/api';
import { useMapDoc } from '../map/useMapDoc';
import { MapCanvas } from '../map/MapCanvas';
import type { ProjectDetail } from '../lib/types';

export function MapPage() {
  const { projectId } = useParams();
  const navigate = useNavigate();
  const { data: project } = useQuery({
    queryKey: ['project', projectId],
    queryFn: () => api<ProjectDetail>(`/projects/${projectId}`),
    enabled: !!projectId,
  });

  const mapId = project?.mapId ?? undefined;
  const { repo, nodes, synced, provider } = useMapDoc(mapId);

  return (
    <div className="h-screen flex flex-col bg-slate-50">
      <header className="h-14 shrink-0 bg-white border-b border-slate-100 flex items-center gap-4 px-6">
        <button className="text-slate-500 hover:text-blue-600" onClick={() => navigate('/')}>
          ← 返回
        </button>
        <span className="font-semibold text-slate-800">{project?.name ?? '加载中…'}</span>
        <span className="ml-auto text-xs text-slate-400">
          {synced ? '● 已连接' : '○ 连接中…'} · Tab 建子 · Enter 建同级 · 双击/F2 改名 · Del 删除 · ⌘Z 撤销
        </span>
      </header>
      <div className="flex-1 min-h-0">
        {repo && synced ? (
          <MapCanvas repo={repo} nodes={nodes} provider={provider} />
        ) : (
          <div className="h-full flex items-center justify-center text-slate-400">
            正在连接协同文档…
          </div>
        )}
      </div>
    </div>
  );
}
