import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { defineConfig } from 'vitest/config';

// Integration tests run against a dedicated PostgreSQL database whose name must end in "_test"
// (enforced in test/global-setup.ts). Data in it is truncated between test files.
const scratch = mkdtempSync(join(tmpdir(), 'hmv-e2e-'));
Object.assign(process.env, {
  DATABASE_URL:
    process.env.TEST_DATABASE_URL ??
    'postgresql://hmv_user:REMOVED_DEV_PASSWORD@localhost:5442/hmv_cms_test?schema=public',
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
