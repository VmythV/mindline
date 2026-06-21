import { loadConfig, saveConfig } from './config';

/** API 调用错误：携带服务端错误码（与 @mindline/shared 错误码对齐）。 */
export class ApiError extends Error {
  constructor(
    public code: string,
    message: string,
    public status: number,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

interface ClientOverrides {
  apiBase?: string;
  token?: string;
}
let overrides: ClientOverrides = {};

/** 注入命令行全局选项（--api / --token）。优先级高于本地配置。 */
export function configureClient(o: ClientOverrides): void {
  overrides = o;
}

function apiBase(): string {
  return overrides.apiBase ?? loadConfig().apiBase;
}

function token(): string | undefined {
  return overrides.token ?? loadConfig().accessToken;
}

async function parseError(res: Response): Promise<ApiError> {
  let code = `HTTP_${res.status}`;
  let message = `请求失败 (HTTP ${res.status})`;
  try {
    const body = (await res.json()) as { error?: { code?: string; message?: string } };
    if (body?.error?.message) message = body.error.message;
    if (body?.error?.code) code = body.error.code;
  } catch {
    // 非 JSON 响应，沿用默认
  }
  return new ApiError(code, message, res.status);
}

/** 用 refreshToken 换新 access（成功则写回配置）。无 refreshToken 或失败返回 false。 */
async function tryRefresh(): Promise<boolean> {
  if (overrides.token) return false; // 显式 token 模式不自动刷新
  const cfg = loadConfig();
  if (!cfg.refreshToken) return false;
  const res = await fetch(`${cfg.apiBase}/auth/refresh`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ refreshToken: cfg.refreshToken }),
  });
  if (!res.ok) return false;
  const data = (await res.json()) as { accessToken?: string; refreshToken?: string };
  if (!data.accessToken) return false;
  saveConfig({
    ...cfg,
    accessToken: data.accessToken,
    refreshToken: data.refreshToken ?? cfg.refreshToken,
  });
  return true;
}

function authHeaders(): Record<string, string> {
  const t = token();
  return {
    'Content-Type': 'application/json',
    ...(t ? { Authorization: `Bearer ${t}` } : {}),
  };
}

/**
 * 带鉴权的 JSON 请求。401 且非显式 token 时自动 refresh 重试一次。
 * @param retry 内部用，防止无限重试
 */
export async function request<T>(
  method: string,
  path: string,
  body?: unknown,
  retry = true,
): Promise<T> {
  const res = await fetch(apiBase() + path, {
    method,
    headers: authHeaders(),
    body: body === undefined ? undefined : JSON.stringify(body),
  });

  if (res.status === 401 && retry && (await tryRefresh())) {
    return request<T>(method, path, body, false);
  }
  if (!res.ok) throw await parseError(res);
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

/**
 * SSE 流式请求（POST）。解析 `event:`/`data:` 帧逐事件回调。
 * 401 自动 refresh 重试一次（流尚未开始时）。
 */
export async function stream(
  path: string,
  body: unknown,
  onEvent: (event: string, data: unknown) => void,
  signal?: AbortSignal,
  retry = true,
): Promise<void> {
  const res = await fetch(apiBase() + path, {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify(body),
    signal,
  });

  if (res.status === 401 && retry && (await tryRefresh())) {
    return stream(path, body, onEvent, signal, false);
  }
  if (!res.ok) throw await parseError(res);

  const reader = res.body?.getReader();
  if (!reader) throw new ApiError('NO_STREAM', '无响应流', res.status);
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
