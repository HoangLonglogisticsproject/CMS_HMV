import { execSync } from 'node:child_process';
import { existsSync } from 'node:fs';

export default function setup() {
  const database = new URL(process.env.DATABASE_URL!).pathname.slice(1);
  if (!database.endsWith('_test')) {
    throw new Error(
      `Refusing to run destructive integration tests against "${database}": the database name must end with "_test"`,
    );
  }
  // Non-destructive: applies pending migrations, creating the database if needed.
  execSync('npx prisma migrate deploy', { stdio: 'inherit' });
  if (!existsSync('dist/scripts/export-openapi.js'))
    throw new Error('Run `pnpm build` first (pnpm test:e2e does it for you)');
  execSync(
    `node dist/scripts/export-openapi.js "${process.env.OPENAPI_SPEC_PATH}"`,
    { stdio: 'inherit' },
  );
}
