/**
 * 统一错误模型与错误码 —— 见 API契约总览 §1.3 / §1.4。
 */
export const ERROR_CODES = [
  'UNAUTHENTICATED', // 401
  'FORBIDDEN', // 403
  'NOT_FOUND', // 404
  'VALIDATION_ERROR', // 400 / 422
  'CONFLICT', // 409
  'RATE_LIMITED', // 429
  'QUOTA_EXCEEDED', // 429（AI 额度）
  'UPSTREAM_ERROR', // 502
  'TIMEOUT', // 504
  'INTERNAL', // 500
] as const;

export type ErrorCode = (typeof ERROR_CODES)[number];

export interface ApiErrorBody {
  error: {
    code: ErrorCode;
    message: string;
    details?: Record<string, unknown>;
  };
}

/**
 * 协同 WebSocket 关闭码 —— 见 API §1.4 / Yjs协同详设 §13。
 */
export const WS_CLOSE = {
  UNAUTHORIZED: 4401,
  FORBIDDEN_MAP: 4403,
  MAP_NOT_FOUND: 4404,
  SERVER_ERROR: 1011,
} as const;

export type WsCloseCode = (typeof WS_CLOSE)[keyof typeof WS_CLOSE];
