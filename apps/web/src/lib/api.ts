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

/**
 * SSE 流式请求（POST）。fetch + ReadableStream 解析 `event:`/`data:` 帧，逐事件回调。
 * 用于 AI decompose（EventSource 不支持自定义 header，故用 fetch stream）。
 */
export async function apiStream(
  path: string,
  body: unknown,
  onEvent: (event: string, data: unknown) => void,
  signal?: AbortSignal,
): Promise<void> {
  const token = useAuth.getState().accessToken;
  const res = await fetch(BASE + path, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(body),
    signal,
  });

  if (!res.ok) {
    if (res.status === 401) useAuth.getState().logout();
    let message = `请求失败 (HTTP ${res.status})`;
    try {
      const b = (await res.json()) as { error?: { message?: string } };
      if (b?.error?.message) message = b.error.message;
    } catch {
      /* ignore */
    }
    throw new Error(message);
  }

  const reader = res.body?.getReader();
  if (!reader) throw new Error('无响应流');
  const decoder = new TextDecoder();
  let buffer = '';
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const frames = buffer.split('\n\n');
    buffer = frames.pop() ?? '';
    for (const frame of frames) {
      let event = 'message';
      let dataStr = '';
      for (const line of frame.split('\n')) {
        if (line.startsWith('event:')) event = line.slice(6).trim();
        else if (line.startsWith('data:')) dataStr += line.slice(5).trim();
      }
      if (!dataStr) continue;
      let data: unknown;
      try {
        data = JSON.parse(dataStr);
      } catch {
        data = dataStr;
      }
      onEvent(event, data);
    }
  }
}
