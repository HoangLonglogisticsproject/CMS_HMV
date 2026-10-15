// Creates a CMS user, or resets an existing user's password/roles. There is no user-management API yet.
//
//   HMV_USER_PASSWORD='…' pnpm user:create --email admin@hmv.vn --name "Quản trị viên" --role ADMIN
//   echo '…' | pnpm user:create --email editor@hmv.vn --name "Biên tập" --role EDITOR --role REVIEWER
//
// The password comes from HMV_USER_PASSWORD or the first line of stdin, never from argv (shell history).
// Uses DATABASE_URL from the environment or .env.
import { PrismaClient } from '@prisma/client';
import { parseArgs } from 'node:util';
import { hashPassword } from '../modules/auth/password';

async function main() {
  try {
    process.loadEnvFile('.env');
  } catch {
    // no .env file: rely on the environment
  }

  const { values } = parseArgs({
    options: {
      email: { type: 'string' },
      name: { type: 'string' },
      role: { type: 'string', multiple: true },
    },
  });
  const email = values.email?.trim().toLowerCase();
  const roles = values.role ?? [];
  if (!email || !values.name || roles.length === 0) {
    console.error(
      'Usage: pnpm user:create --email <email> --name <display name> --role <ROLE> [--role <ROLE>…]',
    );
    process.exit(1);
  }

  let password = process.env.HMV_USER_PASSWORD;
  if (!password) {
    const chunks: Buffer[] = [];
    for await (const chunk of process.stdin) chunks.push(chunk as Buffer);
    password = Buffer.concat(chunks).toString('utf8').split(/\r?\n/)[0];
  }
  if (!password || password.length < 12) {
    console.error(
      'Password must be at least 12 characters (HMV_USER_PASSWORD or stdin).',
    );
    process.exit(1);
  }

  const prisma = new PrismaClient();
  try {
    const known = await prisma.role.findMany({
      where: { code: { in: roles } },
    });
    const unknown = roles.filter((r) => !known.some((k) => k.code === r));
    if (unknown.length)
      throw new Error(
        `Unknown role(s): ${unknown.join(', ')}. Known: ${(await prisma.role.findMany()).map((r) => r.code).join(', ')}`,
      );

    const passwordHash = await hashPassword(password);
    const user = await prisma.$transaction(async (tx) => {
      const u = await tx.user.upsert({
        where: { email },
        create: { email, displayName: values.name!, passwordHash },
        update: { displayName: values.name!, passwordHash, isActive: true },
      });
      await tx.userRole.deleteMany({ where: { userId: u.id } });
      await tx.userRole.createMany({
        data: roles.map((roleCode) => ({ userId: u.id, roleCode })),
      });
      await tx.session.updateMany({
        where: { userId: u.id, revokedAt: null },
        data: { revokedAt: new Date() },
      });
      await tx.auditLog.create({
        data: {
          action: 'user.provision',
          entityType: 'user',
          entityId: u.id,
          metadata: { email, roles, via: 'cli' },
        },
      });
      return u;
    });
    console.log(
      `User ${user.email} (${user.id}) ready with roles: ${roles.join(', ')}`,
    );
  } catch (err) {
    console.error((err as Error).message);
    process.exitCode = 1;
  } finally {
    await prisma.$disconnect();
  }
}

void main();
