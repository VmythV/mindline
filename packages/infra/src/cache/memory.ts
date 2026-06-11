import { EventEmitter } from 'events';
import type { ICacheStore } from './interface';

interface Entry {
  value: string;
  timer: ReturnType<typeof setTimeout> | null;
}

/** 内存缓存适配器（默认开发模式）。进程重启后数据丢失，不支持跨进程共享。 */
export class InMemoryCacheStore implements ICacheStore {
  private readonly store = new Map<string, Entry>();
  private readonly emitter = new EventEmitter();

  async get(key: string): Promise<string | null> {
    return this.store.get(key)?.value ?? null;
  }

  async set(key: string, value: string, ttlSeconds?: number): Promise<void> {
    const existing = this.store.get(key);
    if (existing?.timer) clearTimeout(existing.timer);

    const timer =
      ttlSeconds != null
        ? setTimeout(() => this.store.delete(key), ttlSeconds * 1000)
        : null;

    this.store.set(key, { value, timer });
  }

  async del(...keys: string[]): Promise<void> {
    for (const key of keys) {
      const entry = this.store.get(key);
      if (entry?.timer) clearTimeout(entry.timer);
      this.store.delete(key);
    }
  }

  async publish(channel: string, message: string): Promise<void> {
    this.emitter.emit(channel, message);
  }

  async subscribe(channel: string, handler: (message: string) => void): Promise<() => void> {
    this.emitter.on(channel, handler);
    return () => this.emitter.off(channel, handler);
  }
}
