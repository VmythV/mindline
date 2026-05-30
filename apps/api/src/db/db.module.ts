import { Global, Module } from '@nestjs/common';
import { db } from './index';

/** 注入令牌：Drizzle 数据库实例 */
export const DRIZZLE = 'DRIZZLE';

@Global()
@Module({
  providers: [{ provide: DRIZZLE, useValue: db }],
  exports: [DRIZZLE],
})
export class DbModule {}
