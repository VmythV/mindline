import type { ICacheStore } from './interface';

/**
 * Redis 缓存适配器（生产模式占位，CACHE_DRIVER=redis 时启用）。
 * 待 M4+/M6 多实例广播需求确认后用 ioredis 实现。
 */
export class RedisCacheStore implements ICacheStore {
  constructor(_url: string) {
    throw new Error(
      'RedisCacheStore 尚未实现。请将 CACHE_DRIVER 设为 memory，或实现此适配器后再使用。',
    );
  }

  async get(_key: string): Promise<string | null> {
    return null;
  }
  async set(_key: string, _value: string, _ttlSeconds?: number): Promise<void> {}
  async del(..._keys: string[]): Promise<void> {}
  async publish(_channel: string, _message: string): Promise<void> {}
  async subscribe(_channel: string, _handler: (message: string) => void): Promise<() => void> {
    return () => {};
  }
}
