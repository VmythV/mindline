import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/api';
import type { ProviderList, UsageResp } from '../lib/types';

const PROVIDERS = ['openai', 'qwen', 'deepseek', 'vllm', 'other'];

const emptyForm = { provider: 'openai', endpoint: '', model: '', apiKey: '', isDefault: false };

/** AI 凭证设置（租户级）：配置 OpenAI 兼容 provider，密钥脱敏展示，用量统计。 */
export function AiProvidersPage() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [form, setForm] = useState(emptyForm);

  const { data } = useQuery({ queryKey: ['ai-providers'], queryFn: () => api<ProviderList>('/ai/providers') });
  const { data: usage } = useQuery({ queryKey: ['ai-usage'], queryFn: () => api<UsageResp>('/ai/usage') });

  const invalidate = () => void qc.invalidateQueries({ queryKey: ['ai-providers'] });

  const create = useMutation({
    mutationFn: () => api<{ id: string }>('/ai/providers', { method: 'POST', body: JSON.stringify(form) }),
    onSuccess: () => {
      setForm(emptyForm);
      invalidate();
    },
  });
  const patch = useMutation({
    mutationFn: (v: { id: string; body: Record<string, unknown> }) =>
      api<{ id: string }>(`/ai/providers/${v.id}`, { method: 'PATCH', body: JSON.stringify(v.body) }),
    onSuccess: invalidate,
  });
  const remove = useMutation({
    mutationFn: (id: string) => api<{ id: string }>(`/ai/providers/${id}`, { method: 'DELETE' }),
    onSuccess: invalidate,
  });

  const canCreate = form.endpoint.trim() && !create.isPending;

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="h-14 bg-white border-b border-slate-100 flex items-center gap-4 px-6">
        <button className="text-slate-500 hover:text-blue-600" onClick={() => navigate('/')}>
          ← 返回
        </button>
        <span className="font-semibold text-slate-800">AI 设置</span>
      </header>

      <main className="max-w-3xl mx-auto p-6 space-y-8">
        {/* 新增 */}
        <section className="bg-white rounded-xl border border-slate-100 p-5 space-y-3">
          <h2 className="text-sm font-medium text-slate-700">添加 AI Provider</h2>
          <div className="grid grid-cols-2 gap-3 text-sm">
            <label className="flex flex-col gap-1">
              <span className="text-xs text-slate-400">提供商</span>
              <select
                className="border border-slate-200 rounded px-2 py-1.5"
                value={form.provider}
                onChange={(e) => setForm((f) => ({ ...f, provider: e.target.value }))}
              >
                {PROVIDERS.map((p) => (
                  <option key={p} value={p}>
                    {p}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-xs text-slate-400">模型（可选）</span>
              <input
                className="border border-slate-200 rounded px-2 py-1.5"
                placeholder="gpt-4o-mini"
                value={form.model}
                onChange={(e) => setForm((f) => ({ ...f, model: e.target.value }))}
              />
            </label>
            <label className="flex flex-col gap-1 col-span-2">
              <span className="text-xs text-slate-400">Endpoint（OpenAI 兼容 base url，不含 /chat/completions）</span>
              <input
                className="border border-slate-200 rounded px-2 py-1.5"
                placeholder="https://api.openai.com/v1"
                value={form.endpoint}
                onChange={(e) => setForm((f) => ({ ...f, endpoint: e.target.value }))}
              />
            </label>
            <label className="flex flex-col gap-1 col-span-2">
              <span className="text-xs text-slate-400">API Key</span>
              <input
                type="password"
                className="border border-slate-200 rounded px-2 py-1.5"
                placeholder="sk-…"
                value={form.apiKey}
                onChange={(e) => setForm((f) => ({ ...f, apiKey: e.target.value }))}
              />
            </label>
            <label className="flex items-center gap-2 text-slate-600">
              <input
                type="checkbox"
                checked={form.isDefault}
                onChange={(e) => setForm((f) => ({ ...f, isDefault: e.target.checked }))}
              />
              设为默认
            </label>
          </div>
          <button
            className="px-4 py-2 rounded-lg bg-blue-600 text-white text-sm font-medium hover:bg-blue-700 disabled:opacity-50"
            disabled={!canCreate}
            onClick={() => create.mutate()}
          >
            添加
          </button>
          {create.error && <p className="text-xs text-rose-500">{(create.error as Error).message}</p>}
        </section>

        {/* 列表 */}
        <section className="space-y-2">
          <h2 className="text-sm font-medium text-slate-700">已配置</h2>
          {data?.items.length === 0 && <p className="text-slate-400 text-sm">尚无配置；未配置时 AI 拆解走 env 网关或 stub。</p>}
          <ul className="space-y-2">
            {data?.items.map((p) => (
              <li
                key={p.id}
                className="bg-white rounded-lg border border-slate-100 p-3 flex items-center gap-3 text-sm"
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-slate-700">{p.provider}</span>
                    {p.isDefault && <span className="text-[10px] px-1.5 py-0.5 rounded bg-emerald-50 text-emerald-600">默认</span>}
                    {!p.enabled && <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-100 text-slate-400">已停用</span>}
                  </div>
                  <div className="text-xs text-slate-400 truncate">
                    {p.endpoint}
                    {p.model ? ` · ${p.model}` : ''} · key {p.apiKeyMask || '（无）'}
                  </div>
                </div>
                {!p.isDefault && (
                  <button
                    className="text-xs text-slate-500 hover:text-blue-600"
                    onClick={() => patch.mutate({ id: p.id, body: { isDefault: true } })}
                  >
                    设默认
                  </button>
                )}
                <button
                  className="text-xs text-slate-500 hover:text-blue-600"
                  onClick={() => patch.mutate({ id: p.id, body: { enabled: !p.enabled } })}
                >
                  {p.enabled ? '停用' : '启用'}
                </button>
                <button
                  className="text-xs text-rose-400 hover:text-rose-600"
                  onClick={() => remove.mutate(p.id)}
                >
                  删除
                </button>
              </li>
            ))}
          </ul>
        </section>

        {/* 用量 */}
        {usage && usage.items.length > 0 && (
          <section className="space-y-2">
            <h2 className="text-sm font-medium text-slate-700">
              用量（累计 {usage.totals.calls} 次 · in {usage.totals.tokensIn} / out {usage.totals.tokensOut} tokens）
            </h2>
            <table className="w-full text-xs bg-white rounded-lg border border-slate-100">
              <thead className="text-slate-400">
                <tr className="border-b border-slate-100">
                  <th className="text-left p-2">provider</th>
                  <th className="text-left p-2">model</th>
                  <th className="text-right p-2">次数</th>
                  <th className="text-right p-2">in</th>
                  <th className="text-right p-2">out</th>
                </tr>
              </thead>
              <tbody className="text-slate-600">
                {usage.items.map((r, i) => (
                  <tr key={i} className="border-b border-slate-50">
                    <td className="p-2">{r.provider}</td>
                    <td className="p-2">{r.model}</td>
                    <td className="p-2 text-right">{r.calls}</td>
                    <td className="p-2 text-right">{r.tokensIn}</td>
                    <td className="p-2 text-right">{r.tokensOut}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        )}
      </main>
    </div>
  );
}
