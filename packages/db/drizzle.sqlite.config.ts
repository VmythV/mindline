import { defineConfig } from 'drizzle-kit';

// drizzle-kit push/generate 专用 SQLite 配置。
// 运行目录为 packages/db/，所以默认路径直接用 .dev.db。
const dbPath = process.env.SQLITE_PATH ?? '.dev.db';

export default defineConfig({
  schema: './src/schema.sqlite.ts',
  out: './drizzle-sqlite',
  dialect: 'turso',
  dbCredentials: { url: `file:${dbPath}` },
  verbose: true,
});
