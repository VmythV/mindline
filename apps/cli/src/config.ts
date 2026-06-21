import { homedir } from 'node:os';
import { join } from 'node:path';
import { readFileSync, writeFileSync, mkdirSync, existsSync, chmodSync } from 'node:fs';

/** 本地凭证与配置（落 ~/.mindline/config.json，权限 0600）。 */
export interface CliConfig {
  apiBase: string;
  accessToken?: string;
  refreshToken?: string;
  user?: { id: string; tenantId: string; email: string; displayName: string };
}

const DEFAULT_API_BASE = process.env.MINDLINE_API_BASE ?? 'http://localhost:3001/api';

const CONFIG_DIR = join(homedir(), '.mindline');
const CONFIG_FILE = join(CONFIG_DIR, 'config.json');

/** 读取本地配置；不存在则返回仅含默认 apiBase 的空配置。 */
export function loadConfig(): CliConfig {
  if (!existsSync(CONFIG_FILE)) return { apiBase: DEFAULT_API_BASE };
  try {
    const raw = readFileSync(CONFIG_FILE, 'utf-8');
    const parsed = JSON.parse(raw) as Partial<CliConfig>;
    return { apiBase: DEFAULT_API_BASE, ...parsed };
  } catch {
    return { apiBase: DEFAULT_API_BASE };
  }
}

/** 写回本地配置（含敏感令牌），目录与文件均收紧权限。 */
export function saveConfig(config: CliConfig): void {
  if (!existsSync(CONFIG_DIR)) mkdirSync(CONFIG_DIR, { recursive: true, mode: 0o700 });
  writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2), { mode: 0o600 });
  try {
    chmodSync(CONFIG_FILE, 0o600);
  } catch {
    // 某些文件系统不支持 chmod，忽略
  }
}

/** 清除登录态（保留 apiBase）。 */
export function clearAuth(): void {
  const cfg = loadConfig();
  saveConfig({ apiBase: cfg.apiBase });
}

export const configPath = CONFIG_FILE;
