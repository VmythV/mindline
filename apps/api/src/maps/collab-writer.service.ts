import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  OnModuleDestroy,
  ServiceUnavailableException,
} from '@nestjs/common';
import * as Y from 'yjs';
import WebSocket from 'ws';
import { HocuspocusProvider, HocuspocusProviderWebsocket } from '@hocuspocus/provider';
import { MapRepository, type EmitEvent } from '@mindline/map-core';
import { newId, type Command, type ExecuteCommandsResult } from '@mindline/shared';
import { hasMinRole } from '../common/roles';
import { ChangesService } from '../changes/changes.service';

interface Ctx {
  userId: string;
  tenantId: string;
}

interface PooledConn {
  mapId: string;
  socket: HocuspocusProviderWebsocket;
  provider: HocuspocusProvider;
  doc: Y.Doc;
  repo: MapRepository;
  /** 本次 execute 的事件收集器（命令层同步产出，逐次清空）。 */
  events: EmitEvent[];
  idleTimer: ReturnType<typeof setTimeout> | null;
}

const COLLAB_WS_URL = process.env.COLLAB_WS_URL ?? 'ws://localhost:3002';
const SYNC_TIMEOUT_MS = 10_000;
/** 连接闲置回收时长（须 > collab onStoreDocument 防抖，确保写后快照落库）。 */
const IDLE_TTL_MS = 30_000;

/**
 * 服务端写通道（方案 D）：api 作为 Hocuspocus 客户端连入 collab，
 * 在协同文档上执行命令层（MapRepository），变更经 provider 广播给所有在线客户端，
 * 语义事件复用 ChangesService.append 落库。命令层仍是 Y.Doc 唯一写入口（约定②）。
 *
 * 按 mapId 维护连接池（带闲置 TTL）：避免每次写都全量 sync，并让写后 update 异步 flush。
 * 鉴权由本服务每次 execute 独立完成（resolveMapAccess + Editor+）；
 * collab 连接仅作管道，复用首个建立者的 token（安全性由 api 侧保证）。
 */
@Injectable()
export class CollabWriterService implements OnModuleDestroy {
  private readonly logger = new Logger(CollabWriterService.name);
  private readonly pool = new Map<string, Promise<PooledConn>>();

  constructor(private readonly changes: ChangesService) {}

  async execute(
    mapId: string,
    ctx: Ctx,
    token: string,
    commands: Command[],
  ): Promise<ExecuteCommandsResult> {
    // 1. 鉴权：成员 + Editor+（append 内还会复核一次，此处提前拦截避免无谓连接）
    const { role } = await this.changes.resolveMapAccess(mapId, ctx);
    if (!hasMinRole(role, 'editor')) throw new ForbiddenException('需要编辑权限');

    // 2. 取（或建）已 sync 的协同连接
    const conn = await this.getConn(mapId, token);

    // 3. 同步执行命令并收集事件（命令层 transact + onChanges 均同步）
    conn.events = [];
    const created: string[] = [];
    for (const cmd of commands) {
      created.push(...this.applyCommand(conn.repo, cmd));
    }
    const events = conn.events;

    // 4. 落库（发起方=代表用户的 api；补稳定 eventId 走幂等去重）
    if (events.length > 0) {
      await this.changes.append(mapId, ctx, {
        events: events.map((e) => ({ ...e, eventId: newId('changeEvent') })),
      });
    }

    this.touch(conn);
    return { created, eventCount: events.length };
  }

  /**
   * 人员替换：把该 map 内 ownerId===fromUserId 的节点负责人改挂 toUserId（经命令层 setOwner，产出审计）。
   * 基于 live doc 遍历（不读滞后快照）。返回替换的节点数。
   */
  async replaceOwner(
    mapId: string,
    ctx: Ctx,
    token: string,
    fromUserId: string,
    toUserId: string,
  ): Promise<number> {
    const conn = await this.getConn(mapId, token);
    conn.events = [];
    const targets = conn.repo.list().filter((n) => n.data.ownerId === fromUserId);
    for (const n of targets) conn.repo.setOwner(n.id, toUserId);
    const events = conn.events;
    if (events.length > 0) {
      await this.changes.append(mapId, ctx, {
        events: events.map((e) => ({ ...e, eventId: newId('changeEvent') })),
      });
    }
    this.touch(conn);
    return targets.length;
  }

  /** 将单条 Command 映射到命令层方法；返回本条新建的节点 id。 */
  private applyCommand(repo: MapRepository, cmd: Command): string[] {
    switch (cmd.kind) {
      case 'ensureRoot':
        return [repo.ensureRoot()];
      case 'createChild': {
        const id = repo.createChild(cmd.parentId, cmd.title);
        if (cmd.type && cmd.type !== 'idea') repo.setType(id, cmd.type, []);
        if (cmd.data) {
          for (const [k, v] of Object.entries(cmd.data)) repo.setField(id, k, v);
        }
        return [id];
      }
      case 'rename':
        repo.rename(cmd.nodeId, cmd.title);
        return [];
      case 'setField':
        repo.setField(cmd.nodeId, cmd.field, cmd.value);
        return [];
      case 'setOwner':
        repo.setOwner(cmd.nodeId, cmd.ownerId);
        return [];
      case 'setType':
        repo.setType(cmd.nodeId, cmd.newType, cmd.validFieldKeys);
        return [];
      case 'move':
        repo.moveNode(cmd.nodeId, cmd.newParentId);
        return [];
      case 'delete':
        repo.deleteSubtree(cmd.nodeId);
        return [];
      case 'applyProposal': {
        const accepted = new Set(cmd.accepted ?? cmd.proposal.ops.map((o) => o.tempId));
        return repo.applyProposal(cmd.proposal, accepted, cmd.edits ?? {});
      }
      default: {
        // 编译期穷尽 + 运行时拒绝非法 kind（DTO 不深度校验联合）
        const _exhaustive: never = cmd;
        throw new BadRequestException(`不支持的命令: ${JSON.stringify(_exhaustive)}`);
      }
    }
  }

  private async getConn(mapId: string, token: string): Promise<PooledConn> {
    let pending = this.pool.get(mapId);
    if (!pending) {
      pending = this.openConn(mapId, token).catch((e: unknown) => {
        this.pool.delete(mapId); // 失败不缓存，允许重试
        throw e;
      });
      this.pool.set(mapId, pending);
    }
    return pending;
  }

  private async openConn(mapId: string, token: string): Promise<PooledConn> {
    const doc = new Y.Doc();
    // Node 端需经独立 socket 注入 ws polyfill（与 collab/scripts/e2e.mjs 同模式）；
    // WebSocketPolyfill 类型为 any，传 ws 的 WebSocket 即可。
    const socket = new HocuspocusProviderWebsocket({
      url: COLLAB_WS_URL,
      WebSocketPolyfill: WebSocket,
    });
    const provider = new HocuspocusProvider({
      websocketProvider: socket,
      name: mapId,
      token,
      document: doc,
    });
    try {
      await this.waitSynced(provider);
    } catch (e) {
      provider.destroy();
      socket.destroy();
      this.logger.warn(`连接 collab 失败 map=${mapId}: ${(e as Error).message}`);
      throw new ServiceUnavailableException('协同服务不可达，请稍后重试');
    }
    const conn: PooledConn = {
      mapId,
      socket,
      provider,
      doc,
      repo: null as never,
      events: [],
      idleTimer: null,
    };
    conn.repo = new MapRepository(mapId, doc, (evs) => conn.events.push(...evs));
    return conn;
  }

  private waitSynced(provider: HocuspocusProvider): Promise<void> {
    return new Promise((resolve, reject) => {
      if (provider.synced) return resolve();
      const timer = setTimeout(() => reject(new Error('collab 同步超时')), SYNC_TIMEOUT_MS);
      const onSync = () => {
        clearTimeout(timer);
        resolve();
      };
      provider.on('synced', onSync);
      provider.on('authenticationFailed', () => {
        clearTimeout(timer);
        reject(new Error('collab 鉴权失败'));
      });
    });
  }

  /** 续期闲置回收计时器。 */
  private touch(conn: PooledConn): void {
    if (conn.idleTimer) clearTimeout(conn.idleTimer);
    conn.idleTimer = setTimeout(() => this.close(conn.mapId), IDLE_TTL_MS);
  }

  private close(mapId: string): void {
    const pending = this.pool.get(mapId);
    this.pool.delete(mapId);
    if (!pending) return;
    void pending
      .then((conn) => {
        if (conn.idleTimer) clearTimeout(conn.idleTimer);
        conn.provider.destroy();
        conn.socket.destroy();
      })
      .catch(() => {
        /* 连接本就建立失败，忽略 */
      });
  }

  onModuleDestroy(): void {
    for (const mapId of [...this.pool.keys()]) this.close(mapId);
  }
}
