import { existsSync, mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { parseEnv } from 'node:util';
import { defineConfig } from 'vitest/config';

// Integration tests run against a dedicated PostgreSQL database whose name must end in "_test"
// (enforced in test/global-setup.ts). Data in it is truncated between test files.
// TEST_DATABASE_URL, or else the server and credentials of DATABASE_URL in backend/.env with the database
// hmv_cms_test: no password is ever written in this repository.
function testDatabaseUrl() {
  if (process.env.TEST_DATABASE_URL) return process.env.TEST_DATABASE_URL;
  const file = join(__dirname, '.env');
  const dev = existsSync(file)
    ? parseEnv(readFileSync(file, 'utf8')).DATABASE_URL
    : undefined;
  if (!dev)
    throw new Error(
      'Set TEST_DATABASE_URL, or DATABASE_URL in backend/.env (its server is reused with the database hmv_cms_test).',
    );
  const url = new URL(dev);
  url.pathname = '/hmv_cms_test';
  return url.toString();
}

const scratch = mkdtempSync(join(tmpdir(), 'hmv-e2e-'));
Object.assign(process.env, {
  DATABASE_URL: testDatabaseUrl(),
  NODE_ENV: 'test',
  CORS_ORIGIN: 'http://localhost:3000',
  STORAGE_DRIVER: 'local',
  LOCAL_STORAGE_DIR: join(scratch, 'media'),
  MEDIA_PUBLIC_BASE_URL: 'http://localhost:4000/media-files',
  MEDIA_MAX_BYTES: String(64 * 1024),
  OPENAPI_SPEC_PATH: join(scratch, 'openapi.json'),
});

export default defineConfig({
  resolve: { tsconfigPaths: true },
  test: {
    globals: true,
    root: './',
    include: ['test/**/*.e2e-spec.ts'],
    globalSetup: './test/global-setup.ts',
    fileParallelism: false, // test files share one database
    testTimeout: 30_000,
    hookTimeout: 60_000,
  },
});
