// Writes the OpenAPI document produced by the built app (the Swagger CLI plugin only runs in `nest build`).
// Usage: pnpm openapi:export [output-path]   (default: ../docs/api/openapi-spec.json)
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { AppModule } from '../app.module';
import { configureApp, createOpenApiDocument } from '../app.setup';

async function main() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    bodyParser: false,
    logger: ['error'],
  });
  configureApp(app);
  const out = resolve(
    process.argv[2] ??
      resolve(__dirname, '../../../docs/api/openapi-spec.json'),
  );
  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(
    out,
    `${JSON.stringify(createOpenApiDocument(app), null, 2)}\n`,
  );
  await app.close();
  console.log(`OpenAPI written to ${out}`);
}
void main();
