import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { SwaggerModule } from '@nestjs/swagger';
import { AppModule } from './app.module';
import { configureApp, createOpenApiDocument } from './app.setup';
import { APP_CONFIG, type AppConfig } from './config';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    bodyParser: false,
    rawBody: true, // req.rawBody for the signed trade inquiry ingestion (app.setup.ts)
  });
  configureApp(app);
  const config = app.get<AppConfig>(APP_CONFIG);
  if (!config.isProduction)
    SwaggerModule.setup('docs', app, createOpenApiDocument(app));
  app.enableShutdownHooks();
  await app.listen(config.port);
  console.log(
    `[HMV CMS API] listening on :${config.port}${config.isProduction ? '' : ' — docs at /docs'}`,
  );
}
void bootstrap();
