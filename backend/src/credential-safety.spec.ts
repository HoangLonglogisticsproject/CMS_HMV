// Guards against the causes of the 2026-10 admin lockouts coming back: hidden credential writers, provisioning wired
// into install/build/start, automation using real accounts, and passwords committed in scripts or docs.
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import type { PrismaClient } from '@prisma/client';
import { resetTestData } from './scripts/reset-test-data';

const backend = resolve(__dirname, '..');
const repo = resolve(backend, '..');
const files = (dir: string, ext = /\.(ts|tsx|mjs|js|md|json)$/) =>
  existsSync(dir)
    ? readdirSync(dir, { recursive: true, encoding: 'utf8' })
        .filter((f) => ext.test(f) && !/node_modules|dist|\.next/.test(f))
        .map((f) => join(dir, f))
    : [];
const rel = (f: string) => relative(repo, f).replaceAll('\\', '/');

describe('credential safety', () => {
  it('only reviewed code touches password hashes', () => {
    const writers = files(join(backend, 'src'), /\.ts$/)
      .filter((f) => !f.endsWith('.spec.ts'))
      .filter((f) => readFileSync(f, 'utf8').includes('passwordHash'))
      .map(rel)
      .sort();
    expect(writers).toEqual([
      'backend/src/modules/auth/auth.service.ts', // login (read) + self-service change
      'backend/src/modules/users/users.service.ts', // admin create / reset
      'backend/src/scripts/create-user.ts', // create only, never overwrites
      'backend/src/scripts/reset-password.ts', // explicit, confirmed reset
    ]);
  });

  it('install, build, start and dev never provision, reset or seed accounts', () => {
    const lifecycle = /^(pre|post)?(install|prepare|build|start|dev)(:.*)?$/;
    const forbidden =
      /user:create|user:reset-password|create-user|reset-password|reset-test-data|migrate reset|db push|seed/;
    for (const pkg of [
      'package.json',
      'backend/package.json',
      'frontend/package.json',
    ]) {
      const json = JSON.parse(readFileSync(join(repo, pkg), 'utf8')) as {
        scripts?: Record<string, string>;
        prisma?: { seed?: string };
      };
      for (const [name, command] of Object.entries(json.scripts ?? {}))
        if (lifecycle.test(name))
          expect(`${pkg} ${name}: ${command}`).not.toMatch(forbidden);
      expect(json.prisma?.seed).toBeUndefined();
    }
  });

  it('automation never uses development accounts', () => {
    const automation = [
      ...files(join(repo, 'frontend/e2e')),
      ...files(join(repo, 'frontend/scripts')),
      ...files(join(backend, 'test')),
    ];
    const offenders = automation
      .filter((f) => /@hmv\.local\b/.test(readFileSync(f, 'utf8')))
      .map(rel);
    expect(offenders).toEqual([]);
  });

  it('no password values are committed for the provisioning CLIs', () => {
    const scanned = [
      ...files(join(repo, 'docs')),
      ...files(join(repo, 'frontend/e2e')),
      ...files(join(repo, 'frontend/scripts')),
      ...files(join(backend, 'src/scripts')),
      ...['README.md', 'backend/README.md', 'frontend/README.md'].map((f) =>
        join(repo, f),
      ),
    ].filter(existsSync);
    // `HMV_USER_PASSWORD=<literal>`; placeholders (<…>, $VAR, '…') and plain mentions are fine.
    const literal = /HMV_USER_PASSWORD\s*=\s*['"]?(?![<$'"…\s])[^\s'"]{4,}/;
    const offenders = scanned
      .filter((f) => literal.test(readFileSync(f, 'utf8')))
      .map(rel);
    expect(offenders).toEqual([]);
  });

  it('the destructive test reset refuses any database not named *_test', async () => {
    const prisma = {
      $executeRawUnsafe: () => {
        throw new Error('must not run');
      },
    } as unknown as PrismaClient;
    const saved = process.env.DATABASE_URL;
    try {
      for (const db of ['hmv_cms', 'hmv_cms_test_backup', 'production']) {
        process.env.DATABASE_URL = `postgresql://u:p@localhost:5442/${db}`;
        await expect(resetTestData(prisma)).rejects.toThrow('Refusing to wipe');
      }
    } finally {
      process.env.DATABASE_URL = saved;
    }
  });
});
