import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import helmet from 'helmet';
import * as compression from 'compression';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { AppModule } from './app.module';
import { ConfigService } from '@nestjs/config';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, { cors: true });

  app.use(helmet());
  app.use(compression());
  app.setGlobalPrefix(process.env.API_BASE_PATH || '/v1');

  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));

  const config = app.get(ConfigService);
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

  const port = config.get<number>('PORT', 3000);
  await app.listen(port);
  // eslint-disable-next-line no-console
  console.log(`ZENYX Provider API running on http://localhost:${port}${process.env.API_BASE_PATH || '/v1'}`);
  console.log(`Swagger on http://localhost:${port}/${swaggerPath}`);
}

bootstrap();
