import { useAuth } from '../stores/auth';

const BASE = (import.meta.env.VITE_API_BASE as string | undefined) ?? 'http://localhost:3001/api';

/** 带鉴权的 API 请求封装；401 自动登出。 */
export async function api<T>(path: string, options: RequestInit = {}): Promise<T> {
  const token = useAuth.getState().accessToken;
  const res = await fetch(BASE + path, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...options.headers,
    },
  });

  if (!res.ok) {
    let message = `请求失败 (HTTP ${res.status})`;
    try {
      const body = (await res.json()) as { error?: { message?: string } };
      if (body?.error?.message) message = body.error.message;
    } catch {
      // ignore parse error
    }
    if (res.status === 401) useAuth.getState().logout();
    throw new Error(message);
  }

  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}
