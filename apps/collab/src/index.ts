import { Server } from '@hocuspocus/server';

const port = Number(process.env.COLLAB_PORT ?? 3002);

/**
 * Hocuspocus 协同服务（骨架）。
 *
 * 待 M0.5 实现（见 docs/detail/Yjs协同详设.md §7）：
 *  - onAuthenticate：JWT + 项目成员资格 + map 读/写权限
 *  - onLoadDocument：从 Postgres 取最新快照 + 增量 update 重建 Y.Doc
 *  - onStoreDocument：防抖落 yjs_updates；周期生成 yjs_snapshots
 *  - Redis 扩展：多实例广播 update / awareness
 */
const server = Server.configure({
  port,
  async onListen() {
    console.log(`[collab] Hocuspocus listening on ws://localhost:${port}`);
  },
});

server.listen();
