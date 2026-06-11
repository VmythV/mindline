/** 对象存储适配器接口。本地开发用文件系统，生产用 S3/MinIO。 */
export interface IObjectStore {
  put(key: string, data: Buffer, contentType?: string): Promise<void>;
  get(key: string): Promise<Buffer>;
  delete(key: string): Promise<void>;
  /** 返回可直接访问的 URL（本地适配器返回 file:// 路径，S3 返回预签名 URL） */
  presignedUrl(key: string, expiresInSeconds?: number): Promise<string>;
}

export const OBJECT_STORE = 'OBJECT_STORE';
