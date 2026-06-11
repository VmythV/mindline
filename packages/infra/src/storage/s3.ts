import type { IObjectStore } from './interface';

/**
 * S3/MinIO 对象存储适配器（生产模式占位，STORAGE_DRIVER=s3 时启用）。
 * 待 M4+ 附件功能确认后用 @aws-sdk/client-s3 实现。
 */
export class S3ObjectStore implements IObjectStore {
  constructor(_config: { endpoint: string; accessKey: string; secretKey: string; bucket: string }) {
    throw new Error(
      'S3ObjectStore 尚未实现。请将 STORAGE_DRIVER 设为 local，或实现此适配器后再使用。',
    );
  }

  async put(_key: string, _data: Buffer, _contentType?: string): Promise<void> {}
  async get(_key: string): Promise<Buffer> {
    return Buffer.alloc(0);
  }
  async delete(_key: string): Promise<void> {}
  async presignedUrl(_key: string, _expiresInSeconds?: number): Promise<string> {
    return '';
  }
}
