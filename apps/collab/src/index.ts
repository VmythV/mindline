import { Server } from '@hocuspocus/server';
import { Redis } from '@hocuspocus/extension-redis';
import IORedis from 'ioredis';
import { resolveMapRole, verifyAccessToken } from './auth.js';
import { loadSnapshot, storeSnapshot } from './persistence.js';

const PORT = Number(process.env.COLLAB_PORT ?? 3002);

/**
 * 携带 WS 关闭码的鉴权错误。Hocuspocus 在 onAuthenticate 失败时读取 error.code/reason
 * 作为关闭帧（见 @hocuspocus/server：`error.code ?? Forbidden.code`），据此区分 4401、4403、4404、1011。
 */
class CloseError extends Error {
  constructor(
    readonly code: number,
    readonly reason: string,
  ) {
    super(reason);
  }
}

/**
 * 多实例广播扩展（详设 §7 line 153、§8 line 179）。
 * 设置 COLLAB_REDIS_URL 时启用 Redis extension 跨实例同步 update + awareness；
 * 未设置则单实例（本地开发零依赖，与 infra 缓存默认 memory 同思路）。
 */
function buildExtensions() {
  const url = process.env.COLLAB_REDIS_URL;
  if (!url) return [];
  // 用 createClient 工厂自建 pub/sub 连接：附 error 监听（否则 ioredis 在无监听者时会刷
  // 「Unhandled error event」）+ 退避重连，避免 Redis 不可用时刷屏。ioredis 直接解析 URL（含 password/db）。
  let warnedDown = false;
  const redisExt = new Redis({
    createClient: () =>
      new IORedis(url, {
        retryStrategy: (times) => Math.min(times * 500, 10_000), // 退避重连，封顶 10s
        maxRetriesPerRequest: 3,
      })
        .on('error', (err: Error) => {
          // 降噪：连接中断期间仅首次报一行，恢复（ready）后重置
          if (!warnedDown) {
            console.error('[collab] Redis 连接异常（将退避重连）:', err.message);
            warnedDown = true;
          }
        })
        .on('ready', () => {
          warnedDown = false;
        }),
  });
  console.log(`[collab] Redis 多实例广播已启用 → ${url}`);
  return [redisExt];
}

/**
 * Hocuspocus 协同服务（M0.5）。documentName = mapId。
 * 见 docs/detail/Yjs协同详设.md §7。
 */
const server = Server.configure({
  port: PORT,
  extensions: buildExtensions(),

  // 连接级鉴权：JWT + 项目成员资格（首版软隔离，下发整文档）；失败按场景映射 WS 关闭码
  async onAuthenticate({ token, documentName }) {
    let user: { userId: string; tenantId: string };
    try {
      user = verifyAccessToken(token);
    } catch {
      throw new CloseError(4401, 'Unauthorized'); // 无/无效 token
    }
    let access: Awaited<ReturnType<typeof resolveMapRole>>;
    try {
      access = await resolveMapRole(documentName, user.userId, user.tenantId);
    } catch {
      throw new CloseError(1011, 'Internal Error'); // DB 等服务端错误
    }
    if (access.kind === 'not_found') throw new CloseError(4404, 'Not Found'); // map 不存在/跨租户
    if (access.kind === 'forbidden') throw new CloseError(4403, 'Forbidden'); // 非项目成员
    return { userId: user.userId, tenantId: user.tenantId, role: access.role };
  },

  async onLoadDocument({ documentName, document }) {
    await loadSnapshot(documentName, document);
    return document;
  },

  async onStoreDocument({ documentName, document }) {
    await storeSnapshot(documentName, document);
  },

  async onListen() {
    console.log(`[collab] Hocuspocus listening on ws://localhost:${PORT}`);
  },
});

server.listen();
