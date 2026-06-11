/** 缓存适配器接口。本地开发用内存实现，生产用 Redis。 */
export interface ICacheStore {
  get(key: string): Promise<string | null>;
  set(key: string, value: string, ttlSeconds?: number): Promise<void>;
  del(...keys: string[]): Promise<void>;
  /** 发布消息到频道（用于 Hocuspocus 多实例广播，M6） */
  publish(channel: string, message: string): Promise<void>;
  /** 订阅频道，返回取消订阅函数 */
  subscribe(channel: string, handler: (message: string) => void): Promise<() => void>;
}

export const CACHE_STORE = 'CACHE_STORE';
