import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import helmet from 'helmet';
import * as compression from 'compression';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { AppModule } from './app.module';
import { ConfigService } from '@nestjs/config';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, {
    cors: true,
  });

  app.use(helmet());
  app.use(compression());

  const apiPrefix = (process.env.API_BASE_PATH || 'v1').replace(/^\/+/, '');
  app.setGlobalPrefix(apiPrefix);

  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));

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

  const config = app.get(ConfigService);

  // ✅ IMPORTANT Railway : écouter sur 0.0.0.0 et sur PORT (souvent 8080)
  const port = Number(process.env.PORT || config.get<number>('PORT') || 8080);
  const host = '0.0.0.0';

  await app.listen(port, host);

  console.log(`ZENYX Provider API running on ${process.env.RAILWAY_PUBLIC_DOMAIN ? `https://${process.env.RAILWAY_PUBLIC_DOMAIN}` : `http://${host}:${port}`}/${apiPrefix}`);
  console.log(`Swagger on ${process.env.RAILWAY_PUBLIC_DOMAIN ? `https://${process.env.RAILWAY_PUBLIC_DOMAIN}` : `http://${host}:${port}`}/${swaggerPath}`);
}

bootstrap();
