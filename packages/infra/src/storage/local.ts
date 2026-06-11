import fs from 'fs/promises';
import path from 'path';
import { pathToFileURL } from 'url';
import type { IObjectStore } from './interface';

/** 本地文件系统对象存储（默认开发模式）。文件保存到 storageDir 目录下，key 中的 / 映射为子目录。 */
export class LocalFileStore implements IObjectStore {
  constructor(private readonly storageDir: string) {}

  private resolve(key: string): string {
    // 防止路径穿越
    const rel = key.replace(/\.\./g, '_');
    return path.join(this.storageDir, rel);
  }

  async put(key: string, data: Buffer, _contentType?: string): Promise<void> {
    const dest = this.resolve(key);
    await fs.mkdir(path.dirname(dest), { recursive: true });
    await fs.writeFile(dest, data);
  }

  async get(key: string): Promise<Buffer> {
    return fs.readFile(this.resolve(key));
  }

  async delete(key: string): Promise<void> {
    await fs.unlink(this.resolve(key)).catch(() => {});
  }

  async presignedUrl(key: string, _expiresInSeconds?: number): Promise<string> {
    return pathToFileURL(this.resolve(key)).href;
  }
}
