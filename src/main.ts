import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import helmet from 'helmet';
import * as compression from 'compression';
import { json } from 'express';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { AppModule } from './app.module';
import { ConfigService } from '@nestjs/config';

import { NestExpressApplication } from '@nestjs/platform-express';
import { join } from 'path';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    cors: true,
  });

  // ✅ Railway / reverse proxy (x-forwarded-for, ip, https)
  app.getHttpAdapter().getInstance().set('trust proxy', 1);

  app.use(helmet());
  app.use(compression());

  // ✅ JSON parser (compatible avec ta signature actuelle)
  app.use(
    json({
      limit: '1mb',
    }),
  );

  // ✅ SERVE STATIC ASSETS
  // Attend un dossier: src/public/assets/* (copié dans dist/public/assets après build)
  // URL finale: https://domain/assets/...
  app.useStaticAssets(join(__dirname, '..', 'public'), {
    prefix: '/',
  });

  const apiPrefix = (process.env.API_BASE_PATH || 'v1').replace(/^\/+/, '');
  app.setGlobalPrefix(apiPrefix);

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      forbidNonWhitelisted: true,
    }),
  );

  // --------------------
  // Swagger
  // --------------------
  const swaggerPath = 'docs';

  const swaggerConfig = new DocumentBuilder()
    .setTitle('ZENYX GAMES Provider API')
    .setDescription('Production-ready casino game provider API (operators only).')
    .setVersion('1.0.0')
    .addApiKey({ type: 'apiKey', name: 'X-API-KEY', in: 'header' }, 'x-api-key')
    .addApiKey({ type: 'apiKey', name: 'X-SIGNATURE', in: 'header' }, 'x-signature')
    .addApiKey({ type: 'apiKey', name: 'X-TIMESTAMP', in: 'header' }, 'x-timestamp')
    .build();

  const document = SwaggerModule.createDocument(app, swaggerConfig);
  SwaggerModule.setup(swaggerPath, app, document);

  const config = app.get(ConfigService);

  // ✅ Railway : écouter sur PORT fourni
  const port = Number(process.env.PORT || config.get<number>('PORT') || 8080);
  const host = '0.0.0.0';

  await app.listen(port, host);

  const baseUrl = process.env.RAILWAY_PUBLIC_DOMAIN
    ? `https://${process.env.RAILWAY_PUBLIC_DOMAIN}`
    : `http://${host}:${port}`;

  console.log(`ZENYX Provider API running on ${baseUrl}/${apiPrefix}`);
  console.log(`Swagger on ${baseUrl}/${swaggerPath}`);
  console.log(`Static assets on ${baseUrl}/assets/*`);
}

bootstrap();
