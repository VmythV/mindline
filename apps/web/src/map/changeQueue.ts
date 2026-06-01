import { newId } from '@mindline/shared';
import type { EmitEvent } from './MapRepository';

/** 落库事件 + 稳定主键（重试复用同一 id → 服务端按 eventId 幂等去重）。 */
export interface QueuedEvent extends EmitEvent {
  eventId: string;
}

/** 注入的落库函数（POST /maps/:mapId/changes）；resolve 即视为已落库。 */
export type FlushFn = (events: QueuedEvent[]) => Promise<unknown>;

const STORAGE_PREFIX = 'mindline:pending-changes:';
const BASE_BACKOFF = 1000;
const MAX_BACKOFF = 30_000;

/**
 * ChangeEvent 持久重试队列（对应 TODOLIST D1 · 落库可靠性）。
 *
 * 内存 + localStorage 双写：入队即落盘，冲刷成功才出队 —— 网络抖动 / 短断线 /
 * 刷新 / 关页重开后仍能补发已产生的语义事件。服务端按 `eventId` 做
 * `onConflictDoNothing` 去重，故重复冲刷天然安全（at-least-once + 幂等）。
 *
 * 残留缺口：浏览器硬崩溃且 localStorage 尚未写入的极窄窗口仍可能丢；
 * collab 服务端语义反推兜底留待后续（D1 ⚠️ 仍部分开放）。
 */
export class ChangeQueue {
  private pending: QueuedEvent[];
  private timer: ReturnType<typeof setTimeout> | null = null;
  private backoff = BASE_BACKOFF;
  private flushing = false;
  private disposed = false;
  private readonly storageKey: string;

  constructor(
    readonly mapId: string,
    private readonly flushFn: FlushFn,
  ) {
    this.storageKey = STORAGE_PREFIX + mapId;
    this.pending = this.load();
  }

  /** 待落库事件数（测试 / UI 可观测用）。 */
  get size(): number {
    return this.pending.length;
  }

  /** 入队一批语义事件（赋稳定 eventId），落盘并触发冲刷。 */
  enqueue(events: EmitEvent[]): void {
    if (this.disposed || events.length === 0) return;
    for (const e of events) this.pending.push({ ...e, eventId: newId('changeEvent') });
    this.persist();
    void this.flush();
  }

  /** 冲刷队列；失败按指数退避重试，成功后从队首出队。重连/重载时可主动调用。 */
  async flush(): Promise<void> {
    if (this.disposed || this.flushing || this.pending.length === 0) return;
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    this.flushing = true;
    // 快照当前批次；冲刷期间新入队的事件只会追加在队尾，故成功后按长度从队首裁剪。
    const batch = this.pending.slice();
    try {
      await this.flushFn(batch);
      this.pending = this.pending.slice(batch.length);
      this.persist();
      this.backoff = BASE_BACKOFF;
      this.flushing = false;
      if (this.pending.length > 0) void this.flush();
    } catch {
      // 整批重试：已被服务端接收的事件因 eventId 幂等不会重复落库。
      this.flushing = false;
      this.scheduleRetry();
    }
  }

  /** 停止重试并释放定时器（组件卸载 / 切图时调用）；不清空 localStorage 残留。 */
  dispose(): void {
    this.disposed = true;
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
  }

  private scheduleRetry(): void {
    if (this.disposed || this.timer) return;
    const delay = this.backoff;
    this.backoff = Math.min(this.backoff * 2, MAX_BACKOFF);
    this.timer = setTimeout(() => {
      this.timer = null;
      void this.flush();
    }, delay);
  }

  private persist(): void {
    try {
      if (this.pending.length === 0) localStorage.removeItem(this.storageKey);
      else localStorage.setItem(this.storageKey, JSON.stringify(this.pending));
    } catch {
      /* 隐私模式 / 配额超限：退化为仅内存队列 */
    }
  }

  private load(): QueuedEvent[] {
    try {
      const raw = localStorage.getItem(this.storageKey);
      if (!raw) return [];
      const arr = JSON.parse(raw) as unknown;
      return Array.isArray(arr) ? (arr as QueuedEvent[]) : [];
    } catch {
      return [];
    }
  }
}
