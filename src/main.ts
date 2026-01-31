import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import helmet from 'helmet';
import * as compression from 'compression';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { AppModule } from './app.module';
import { ConfigService } from '@nestjs/config';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, { cors: true });

  // Security + perf
  app.use(helmet());
  app.use(compression());

  // Global prefix
  const apiBasePath = process.env.API_BASE_PATH || '/v1';
  app.setGlobalPrefix(apiBasePath);

  // Validation (DTO)
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      forbidNonWhitelisted: false,
    }),
  );

  // Swagger
  const swaggerPath = 'docs';
  const swaggerConfig = new DocumentBuilder()
    .setTitle('ZENYX GAMES Provider API')
    .setDescription('Production-ready casino game provider API (operators only).')
    .setVersion('1.0.0')
    .addApiKey({ type: 'apiKey', name: 'X-API-KEY', in: 'header' }, 'x-api-key')
    .addApiKey({ type: 'apiKey', name: 'X-SIGNATURE', in: 'header' }, 'x-signature')
    .addBearerAuth()
    .build();

  const document = SwaggerModule.createDocument(app, swaggerConfig);
  SwaggerModule.setup(swaggerPath, app, document);

  // Port: Railway -> process.env.PORT
  const config = app.get(ConfigService);
  const port = Number(process.env.PORT ?? config.get<number>('PORT') ?? 3000);

  // IMPORTANT: Cloud/Railway needs 0.0.0.0 (not localhost)
  await app.listen(port, '0.0.0.0');

  // Logs
  const publicUrl = process.env.RAILWAY_PUBLIC_DOMAIN
    ? `https://${process.env.RAILWAY_PUBLIC_DOMAIN}`
    : `http://0.0.0.0:${port}`;

  // eslint-disable-next-line no-console
  console.log(`ZENYX Provider API running on ${publicUrl}${apiBasePath}`);
  // eslint-disable-next-line no-console
  console.log(`Swagger on ${publicUrl}/${swaggerPath}`);
}

bootstrap();
