// Creates a NEW CMS user. It never modifies an existing account: an email that already exists is refused.
// Password changes go through `pnpm user:reset-password` (or the admin API / self-service change).
//
//   pnpm --filter backend user:create --email editor@hmv.vn --name "Biên tập" --role EDITOR [--role REVIEWER]
//
// The password is typed at a hidden prompt, or comes from HMV_USER_PASSWORD / the first line of stdin for automation;
// never from argv (shell history). Uses DATABASE_URL from the environment or backend/.env.
import { Prisma, PrismaClient } from '@prisma/client';
import { parseArgs } from 'node:util';
import { hashPassword } from '../modules/auth/password';
import {
  describeTarget,
  fail,
  loadEnv,
  looksLikeEmail,
  normalizeEmail,
  readNewPassword,
} from './cli';

async function main() {
  loadEnv();
  const { values } = parseArgs({
    options: {
      email: { type: 'string' },
      name: { type: 'string' },
      role: { type: 'string', multiple: true },
    },
  });
  const email = normalizeEmail(values.email ?? '');
  const name = values.name?.trim();
  const roles = [...new Set(values.role ?? [])];
  if (!email || !name || roles.length === 0)
    fail(
      'Usage: pnpm user:create --email <email> --name <display name> --role <ROLE> [--role <ROLE>…]',
    );
  if (!looksLikeEmail(email)) fail(`"${email}" is not a valid email address`);
  if (name.length > 120) fail('Display name must be at most 120 characters');

  console.log(`Target database: ${describeTarget()}`);
  const prisma = new PrismaClient();
  try {
    const known = await prisma.role.findMany({ select: { code: true } });
    const unknown = roles.filter((r) => !known.some((k) => k.code === r));
    if (unknown.length)
      fail(
        `Unknown role(s): ${unknown.join(', ')}. Known: ${known.map((k) => k.code).join(', ')}`,
      );
    if (
      await prisma.user.findUnique({ where: { email }, select: { id: true } })
    )
      fail(
        `User ${email} already exists; nothing changed. Use "pnpm user:reset-password" to set a new password.`,
      );

    const passwordHash = await hashPassword(await readNewPassword());
    // The unique email constraint makes a concurrent run fail here instead of creating a second account.
    const user = await prisma.$transaction(async (tx) => {
      const u = await tx.user.create({
        data: {
          email,
          displayName: name,
          passwordHash,
          roles: { create: roles.map((roleCode) => ({ roleCode })) },
        },
      });
      await tx.auditLog.create({
        data: {
          action: 'user.create',
          entityType: 'user',
          entityId: u.id,
          metadata: { email, roles, via: 'cli' },
        },
      });
      return u;
    });
    console.log(
      `Created ${user.email} (${user.id}) with roles: ${roles.join(', ')}`,
    );
  } catch (err) {
    if (
      err instanceof Prisma.PrismaClientKnownRequestError &&
      err.code === 'P2002'
    )
      fail(`User ${email} already exists; nothing changed.`);
    fail((err as Error).message);
  } finally {
    await prisma.$disconnect();
  }
}

void main();
