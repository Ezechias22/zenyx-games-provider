import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { ZenyxGamesModule } from './zenyx-games/zenyx-games.module';

async function bootstrap() {
  // Standalone optional server for Zenyx module only.
  // If you import ZenyxGamesModule into your existing app, you do NOT run this file.
  const app = await NestFactory.create(ZenyxGamesModule, { cors: true });
  const port = process.env.ZENYX_PORT ? Number(process.env.ZENYX_PORT) : 3999;
  await app.listen(port);
}
void bootstrap();
