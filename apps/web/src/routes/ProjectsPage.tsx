import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/api';
import { useAuth } from '../stores/auth';
import type { Project, ProjectList } from '../lib/types';

/** 单个项目行 + 懒加载子项目树 */
function ProjectRow({
  project,
  depth,
  onNavigate,
}: {
  project: Project;
  depth: number;
  onNavigate: (p: Project) => void;
}) {
  const queryClient = useQueryClient();
  const [expanded, setExpanded] = useState(false);
  const [addingChild, setAddingChild] = useState(false);
  const [childName, setChildName] = useState('');

  const childrenQuery = useQuery({
    queryKey: ['projects', project.id, 'children'],
    queryFn: () => api<ProjectList>(`/projects?parentId=${project.id}`),
    enabled: expanded,
  });

  const createChild = useMutation({
    mutationFn: (name: string) =>
      api<Project>('/projects', {
        method: 'POST',
        body: JSON.stringify({ name, parentId: project.id }),
      }),
    onSuccess: () => {
      setChildName('');
      setAddingChild(false);
      void queryClient.invalidateQueries({ queryKey: ['projects', project.id, 'children'] });
    },
  });

  const indent = depth * 20;

  return (
    <>
      <li
        className="flex items-center gap-1 py-2 px-3 rounded-lg hover:bg-slate-50 group"
        style={{ paddingLeft: `${indent + 12}px` }}
      >
        {/* 展开/折叠箭头 */}
        <button
          className="w-5 h-5 flex items-center justify-center text-slate-300 hover:text-slate-600 shrink-0"
          onClick={(e) => {
            e.stopPropagation();
            setExpanded((v) => !v);
          }}
        >
          {expanded ? '▾' : '▸'}
        </button>

        {/* 项目名称 */}
        <span
          className="flex-1 font-medium text-slate-800 cursor-pointer hover:text-blue-600 truncate"
          onClick={() => onNavigate(project)}
        >
          {project.name}
        </span>

        {/* 操作按钮（hover 显示） */}
        <button
          className="opacity-0 group-hover:opacity-100 text-xs text-slate-400 hover:text-blue-600 px-2 py-0.5 rounded shrink-0"
          onClick={(e) => {
            e.stopPropagation();
            setExpanded(true);
            setAddingChild(true);
          }}
        >
          + 子项目
        </button>
      </li>

      {/* 新建子项目输入框 */}
      {addingChild && (
        <li style={{ paddingLeft: `${indent + 44}px` }} className="py-1 pr-3">
          <div className="flex items-center gap-2">
            <input
              autoFocus
              className="flex-1 px-2 py-1 text-sm rounded border border-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-400"
              placeholder="子项目名称"
              value={childName}
              onChange={(e) => setChildName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && childName.trim()) createChild.mutate(childName.trim());
                if (e.key === 'Escape') {
                  setAddingChild(false);
                  setChildName('');
                }
              }}
            />
            <button
              className="text-xs px-2 py-1 rounded bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50"
              disabled={!childName.trim() || createChild.isPending}
              onClick={() => createChild.mutate(childName.trim())}
            >
              确认
            </button>
            <button
              className="text-xs px-2 py-1 rounded text-slate-400 hover:text-slate-600"
              onClick={() => {
                setAddingChild(false);
                setChildName('');
              }}
            >
              取消
            </button>
          </div>
        </li>
      )}

      {/* 子项目列表（递归） */}
      {expanded && (
        <>
          {childrenQuery.isLoading && (
            <li style={{ paddingLeft: `${indent + 44}px` }} className="py-1 text-xs text-slate-400">
              加载中…
            </li>
          )}
          {childrenQuery.data?.items.map((child) => (
            <ProjectRow
              key={child.id}
              project={child}
              depth={depth + 1}
              onNavigate={onNavigate}
            />
          ))}
          {childrenQuery.data?.items.length === 0 && !addingChild && (
            <li
              style={{ paddingLeft: `${indent + 44}px` }}
              className="py-1 text-xs text-slate-400 italic"
            >
              暂无子项目
            </li>
          )}
        </>
      )}
    </>
  );
}

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

  const handleNavigate = (p: Project) => navigate(`/p/${p.id}`);

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

      <main className="max-w-2xl mx-auto p-6">
        {/* 新建顶层项目 */}
        <div className="flex items-center gap-2 mb-4">
          <input
            className="flex-1 px-3 py-2 rounded-lg border border-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-400"
            placeholder="新建顶层项目名称"
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

        {/* 项目树 */}
        <div className="bg-white rounded-xl border border-slate-100">
          {isLoading ? (
            <p className="p-4 text-slate-400">加载中…</p>
          ) : (
            <ul className="divide-y divide-slate-50">
              {data?.items.map((p) => (
                <ProjectRow key={p.id} project={p} depth={0} onNavigate={handleNavigate} />
              ))}
              {data?.items.length === 0 && (
                <li className="p-4 text-slate-400 text-center">还没有项目，新建一个吧。</li>
              )}
            </ul>
          )}
        </div>
      </main>
    </div>
  );
}
