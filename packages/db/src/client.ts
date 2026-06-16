import path from 'path';
import { existsSync } from 'fs';
import { drizzle as pgDrizzle } from 'drizzle-orm/postgres-js';
import { drizzle as libsqlDrizzle } from 'drizzle-orm/libsql';
import { createClient } from '@libsql/client';
import postgres from 'postgres';
import { schema } from './schema';
import { sqliteSchema } from './schema.sqlite';

const driver = process.env.DB_DRIVER ?? 'sqlite';

/** 解析 SQLite 文件路径：优先 SQLITE_PATH 环境变量，否则定位到 packages/db/.dev.db */
function resolveSqlitePath(): string {
  if (process.env.SQLITE_PATH) return process.env.SQLITE_PATH;

  let dir = process.cwd();
  while (true) {
    if (existsSync(path.join(dir, 'pnpm-workspace.yaml'))) {
      return path.join(dir, 'packages/db/.dev.db');
    }
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }

  try {
    // import.meta.url 在 ESM 为文件 URL；tsup 的 CJS 构建会将其转换为 pathToFileURL(__filename)
    // dist/index.js → ../  → packages/db/
    return new URL('../.dev.db', import.meta.url).pathname;
  } catch {
    return path.resolve('.dev.db');
  }
}

// ── PostgreSQL ────────────────────────────────────────────────────────────────

/** 底层 postgres.js 连接（仅 postgres 模式下非 null；迁移/原生查询可用） */
export const queryClient: postgres.Sql | null =
  driver === 'postgres'
    ? postgres(process.env.DATABASE_URL ?? 'postgres://mindline:mindline@localhost:5432/mindline')
    : null;

const pgDb = queryClient ? pgDrizzle(queryClient, { schema }) : null;

// ── SQLite (libSQL) ───────────────────────────────────────────────────────────

const sqliteDb = (() => {
  if (driver !== 'sqlite') return null;
  const client = createClient({ url: `file:${resolveSqlitePath()}` });
  return libsqlDrizzle(client, { schema: sqliteSchema });
})();

// ── 统一导出 ──────────────────────────────────────────────────────────────────

/** Drizzle 数据库实例。TypeScript 类型以 PG 为准（服务层 API 一致），运行时按 DB_DRIVER 切换。 */
export const db = (pgDb ?? sqliteDb) as Database;

export type Database = ReturnType<typeof pgDrizzle<typeof schema>>;
