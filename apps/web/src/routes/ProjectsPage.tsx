import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/api';
import { useAuth } from '../stores/auth';
import type { Project, ProjectList } from '../lib/types';

export function ProjectsPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const user = useAuth((s) => s.user);
  const logout = useAuth((s) => s.logout);
  const [name, setName] = useState('');

  const { data, isLoading } = useQuery({
    queryKey: ['projects'],
    queryFn: () => api<ProjectList>('/projects'),
  });

  const createProject = useMutation({
    mutationFn: (projectName: string) =>
      api<Project>('/projects', { method: 'POST', body: JSON.stringify({ name: projectName }) }),
    onSuccess: () => {
      setName('');
      void queryClient.invalidateQueries({ queryKey: ['projects'] });
    },
  });

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="h-14 bg-white border-b border-slate-100 flex items-center justify-between px-6">
        <span className="font-semibold text-slate-800">思谱 Mindline</span>
        <div className="flex items-center gap-3 text-sm text-slate-500">
          <span>{user?.displayName}</span>
          <button className="hover:text-blue-600" onClick={() => navigate('/settings/ai')}>
            AI 设置
          </button>
          <button className="hover:text-blue-600" onClick={logout}>
            退出
          </button>
        </div>
      </header>

      <main className="max-w-3xl mx-auto p-6">
        <div className="flex items-center gap-2 mb-6">
          <input
            className="flex-1 px-3 py-2 rounded-lg border border-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-400"
            placeholder="新建项目名称"
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && name.trim()) createProject.mutate(name.trim());
            }}
          />
          <button
            className="px-4 py-2 rounded-lg bg-blue-600 text-white font-medium hover:bg-blue-700 disabled:opacity-50"
            disabled={!name.trim() || createProject.isPending}
            onClick={() => createProject.mutate(name.trim())}
          >
            新建
          </button>
        </div>

        {isLoading ? (
          <p className="text-slate-400">加载中…</p>
        ) : (
          <ul className="grid grid-cols-2 gap-3">
            {data?.items.map((p) => (
              <li
                key={p.id}
                className="bg-white p-4 rounded-xl border border-slate-100 hover:border-blue-300 cursor-pointer transition"
                onClick={() => navigate(`/p/${p.id}`)}
              >
                <div className="font-medium text-slate-800">{p.name}</div>
                <div className="text-xs text-slate-400 mt-1">{p.id}</div>
              </li>
            ))}
            {data?.items.length === 0 && (
              <li className="text-slate-400 col-span-2">还没有项目，新建一个吧。</li>
            )}
          </ul>
        )}
      </main>
    </div>
  );
}
