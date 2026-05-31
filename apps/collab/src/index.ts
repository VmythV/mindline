import { Server } from '@hocuspocus/server';
import { resolveMapRole, verifyAccessToken } from './auth.js';
import { loadSnapshot, storeSnapshot } from './persistence.js';

const PORT = Number(process.env.COLLAB_PORT ?? 3002);

/**
 * Hocuspocus 协同服务（M0.5）。documentName = mapId。
 * 见 docs/detail/Yjs协同详设.md §7。
 */
const server = Server.configure({
  port: PORT,

  // 连接级鉴权：JWT + 项目成员资格（首版软隔离，下发整文档）
  async onAuthenticate({ token, documentName }) {
    let user: { userId: string; tenantId: string };
    try {
      user = verifyAccessToken(token);
    } catch {
      throw new Error('Unauthorized'); // 关闭码 4401（无/无效 token）
    }
    const role = await resolveMapRole(documentName, user.userId, user.tenantId);
    if (role === null) {
      throw new Error('Forbidden'); // 关闭码 4403（非成员/跨租户）
    }
    return { userId: user.userId, tenantId: user.tenantId, role };
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
