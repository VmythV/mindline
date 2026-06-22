import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { AppModule } from './app.module';
import { validateEnv } from './common/env';

async function bootstrap() {
  validateEnv();
  const app = await NestFactory.create(AppModule);
  app.enableCors({ origin: true, credentials: true });
  app.setGlobalPrefix('api');
  app.useGlobalPipes(
    new ValidationPipe({ transform: true, whitelist: true, forbidNonWhitelisted: true }),
  );
  const port = Number(process.env.API_PORT ?? 3001);
  await app.listen(port);
  console.log(`[api] listening on http://localhost:${port}/api`);
}

void bootstrap();
