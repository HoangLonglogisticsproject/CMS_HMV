import { Global, Module } from '@nestjs/common';

const list = (value?: string) =>
  (value ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);

/** Express `trust proxy`: unset = false, a number = hop count, anything else passed through ("loopback", CIDRs). */
function trustProxy(value?: string): boolean | number | string {
  if (!value || value === 'false') return false;
  if (value === 'true') return true;
  return /^\d+$/.test(value) ? Number(value) : value;
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env) {
  const isProduction = env.NODE_ENV === 'production';
  const port = Number(env.PORT ?? 4000);
  const corsOrigins = list(
    env.CORS_ORIGIN ?? (isProduction ? '' : 'http://localhost:3000'),
  );
  if (isProduction && corsOrigins.length === 0) {
    throw new Error(
      'CORS_ORIGIN must list the CMS frontend origin(s) in production',
    );
  }
  const driver = env.STORAGE_DRIVER ?? 'local';
  if (driver !== 'local' && driver !== 'r2')
    throw new Error(`Unknown STORAGE_DRIVER "${driver}"`);

  return {
    isProduction,
    port,
    corsOrigins,
    trustProxy: trustProxy(env.TRUST_PROXY),
    sessionTtlMs: Number(env.SESSION_TTL_HOURS ?? 12) * 3_600_000,
    mediaMaxBytes: Number(env.MEDIA_MAX_BYTES ?? 10 * 1024 * 1024),
    storage: {
      driver: driver as 'local' | 'r2',
      localDir: env.LOCAL_STORAGE_DIR ?? 'storage/media',
      publicBaseUrl: (
        env.MEDIA_PUBLIC_BASE_URL ?? `http://localhost:${port}/media-files`
      ).replace(/\/+$/, ''),
      r2: {
        accountId: env.R2_ACCOUNT_ID ?? '',
        accessKeyId: env.R2_ACCESS_KEY_ID ?? '',
        secretAccessKey: env.R2_SECRET_ACCESS_KEY ?? '',
        bucket: env.R2_BUCKET ?? '',
        // Override only to point at an S3-compatible test server; defaults to the R2 account endpoint.
        endpoint:
          env.R2_ENDPOINT ??
          (env.R2_ACCOUNT_ID
            ? `https://${env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`
            : ''),
      },
    },
  };
}

export type AppConfig = ReturnType<typeof loadConfig>;
export const APP_CONFIG = Symbol('APP_CONFIG');

/** Exposes the validated config to DI. ConfigModule has already loaded .env into process.env by then. */
@Global()
@Module({
  providers: [{ provide: APP_CONFIG, useFactory: () => loadConfig() }],
  exports: [APP_CONFIG],
})
export class AppConfigModule {}
