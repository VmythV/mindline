import { useNavigate, useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { api } from '../lib/api';
import type { ProjectDetail } from '../lib/types';

/** 画布页占位 —— M0.7 接入 React Flow + 协同。 */
export function MapPage() {
  const { projectId } = useParams();
  const navigate = useNavigate();
  const { data } = useQuery({
    queryKey: ['project', projectId],
    queryFn: () => api<ProjectDetail>(`/projects/${projectId}`),
    enabled: !!projectId,
  });

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="h-14 bg-white border-b border-slate-100 flex items-center gap-4 px-6">
        <button className="text-slate-500 hover:text-blue-600" onClick={() => navigate('/')}>
          ← 返回
        </button>
        <span className="font-semibold text-slate-800">{data?.name ?? '加载中…'}</span>
        <span className="text-xs text-slate-400">mapId: {data?.mapId}</span>
      </header>
      <main className="p-6">
        <p className="text-slate-400">画布将在 M0.7 接入（React Flow + Y.Doc 协同）。</p>
      </main>
    </div>
  );
}
