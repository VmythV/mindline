export * from './client';

// schema 导出：运行时按 DB_DRIVER 切换实际对象，TypeScript 类型始终以 PG schema 为准。
// 这样服务层代码无需修改，查询 Builder 的序列化/反序列化由正确的方言处理。
import { schema as pgSchema } from './schema';
import { sqliteSchema } from './schema.sqlite';

const _schema =
  (process.env.DB_DRIVER ?? 'sqlite') === 'postgres' ? pgSchema : sqliteSchema;

export const schema = _schema as typeof pgSchema;
