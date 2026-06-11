import { Global, Module } from '@nestjs/common';
import {
  CACHE_STORE,
  InMemoryCacheStore,
  RedisCacheStore,
  OBJECT_STORE,
  LocalFileStore,
  S3ObjectStore,
} from '@mindline/infra';
import path from 'path';

@Global()
@Module({
  providers: [
    {
      provide: CACHE_STORE,
      useFactory: () => {
        const driver = process.env.CACHE_DRIVER ?? 'memory';
        if (driver === 'redis') {
          return new RedisCacheStore(
            process.env.REDIS_URL ?? 'redis://localhost:6379',
          );
        }
        return new InMemoryCacheStore();
      },
    },
    {
      provide: OBJECT_STORE,
      useFactory: () => {
        const driver = process.env.STORAGE_DRIVER ?? 'local';
        if (driver === 's3') {
          return new S3ObjectStore({
            endpoint: process.env.S3_ENDPOINT ?? 'http://localhost:9000',
            accessKey: process.env.S3_ACCESS_KEY ?? 'mindline',
            secretKey: process.env.S3_SECRET_KEY ?? 'mindline123',
            bucket: process.env.S3_BUCKET ?? 'mindline',
          });
        }
        const storageDir = process.env.STORAGE_DIR ?? path.resolve('.local-storage');
        return new LocalFileStore(storageDir);
      },
    },
  ],
  exports: [CACHE_STORE, OBJECT_STORE],
})
export class InfraModule {}
