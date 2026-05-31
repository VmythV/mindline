import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { schema } from './schema';

const connectionString =
  process.env.DATABASE_URL ?? 'postgres://mindline:mindline@localhost:5432/mindline';

/** 底层 postgres.js 连接（迁移/原生查询可用） */
export const queryClient = postgres(connectionString);

/** Drizzle 数据库实例（业务查询入口；api 与 collab 共用此包） */
export const db = drizzle(queryClient, { schema });

export type Database = typeof db;
