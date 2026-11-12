import { type INestApplication, ValidationPipe } from '@nestjs/common';
import type { NestExpressApplication } from '@nestjs/platform-express';
import {
  DocumentBuilder,
  type OpenAPIObject,
  SwaggerModule,
} from '@nestjs/swagger';
import { resolve } from 'node:path';
import { ErrorFilter, validationError } from './common/errors';
import { APP_CONFIG, type AppConfig } from './config';

/** Postgres text/jsonb cannot store U+0000; reject it at parse time (→ 400) instead of failing the insert (→ 500). */
function rejectNul(_key: string, value: unknown) {
  if (typeof value === 'string' && value.includes('\u0000'))
    throw new SyntaxError('NUL characters are not allowed');
  return value;
}

/** Shared by main.ts and the e2e tests so both run the exact same pipeline. */
export function configureApp(app: NestExpressApplication) {
  const config = app.get<AppConfig>(APP_CONFIG);
  app.set('trust proxy', config.trustProxy);
  app.disable('x-powered-by');
  app.setGlobalPrefix('api/v1');
  // With the app's `rawBody: true` (main.ts, test/helpers.ts), req.rawBody keeps the exact bytes received: the trade
  // inquiry ingestion signature is computed over them.
  app.useBodyParser('json', { limit: '1mb', reviver: rejectNul });
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      exceptionFactory: validationError,
    }),
  );
  app.useGlobalFilters(new ErrorFilter());
  app.enableCors({
    origin: config.corsOrigins,
    credentials: true,
    allowedHeaders: ['Content-Type', 'X-CSRF-Token'],
    exposedHeaders: ['Retry-After'], // the cross-origin CMS reads it on 429
  });
  app.use(
    (
      req: { path: string },
      res: { setHeader(k: string, v: string): void },
      next: () => void,
    ) => {
      res.setHeader('X-Content-Type-Options', 'nosniff');
      res.setHeader('Referrer-Policy', 'no-referrer');
      // Admin/auth responses carry drafts and session data: never cache them anywhere.
      if (
        !req.path.startsWith('/api/v1/public') &&
        !req.path.startsWith('/media-files')
      )
        res.setHeader('Cache-Control', 'no-store');
      next();
    },
  );
  if (config.storage.driver === 'local') {
    app.useStaticAssets(resolve(config.storage.localDir), {
      prefix: '/media-files/',
      index: false,
      dotfiles: 'deny',
      setHeaders: (res) => {
        res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
        res.setHeader('Content-Security-Policy', "default-src 'none'"); // a served file can never run script
      },
    });
  }
  return app;
}

export function createOpenApiDocument(app: INestApplication): OpenAPIObject {
  const config = new DocumentBuilder()
    .setTitle('HMV Global CMS API')
    .setDescription(
      'Admin API (`/api/v1/admin/*`, `/api/v1/auth/*`) uses an HttpOnly session cookie set by `POST /auth/login` ' +
        '(`hmv_session`, or `__Host-hmv_session` in production) plus the `X-CSRF-Token` header on every write. ' +
        'Public API (`/api/v1/public/*`) is read-only and serves published content only. ' +
        'Errors always have the shape `ErrorResponse`; branch on `code`.',
    )
    .setVersion('1.0.0')
    .addCookieAuth(
      'hmv_session',
      { type: 'apiKey', in: 'cookie', name: 'hmv_session' },
      'session',
    )
    .addApiKey(
      {
        type: 'apiKey',
        in: 'header',
        name: 'X-CSRF-Token',
        description: 'csrfToken from the login/session response',
      },
      'csrf',
    )
    .build();
  const document = SwaggerModule.createDocument(app, config, {
    operationIdFactory: (controller, method) =>
      `${controller.replace(/Controller$/, '')}_${method}`,
  });
  // Session-protected writes need the session cookie AND the CSRF header (one requirement object = AND).
  for (const item of Object.values(document.paths)) {
    for (const method of ['post', 'put', 'patch', 'delete'] as const) {
      const op = item[method];
      if (op?.security?.length) op.security = [{ session: [], csrf: [] }];
    }
  }
  return document;
}
