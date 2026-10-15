// Sets a new password for ONE existing user and signs them out everywhere. Nothing else about the account changes
// (roles, name, active flag). Break-glass path when nobody can sign in to reset it from the CMS.
//
//   pnpm --filter backend user:reset-password --email admin@hmv.vn
//
// Shows the target database and asks for confirmation (non-interactive runs must pass --yes). The password is typed at
// a hidden prompt, or comes from HMV_USER_PASSWORD / the first line of stdin; never from argv.
import { PrismaClient } from '@prisma/client';
import { parseArgs } from 'node:util';
import { hashPassword } from '../modules/auth/password';
import {
  confirm,
  describeTarget,
  fail,
  loadEnv,
  normalizeEmail,
  readNewPassword,
} from './cli';

async function main() {
  loadEnv();
  const { values } = parseArgs({
    options: { email: { type: 'string' }, yes: { type: 'boolean' } },
  });
  const email = normalizeEmail(values.email ?? '');
  if (!email) fail('Usage: pnpm user:reset-password --email <email> [--yes]');

  const prisma = new PrismaClient();
  try {
    const user = await prisma.user.findUnique({
      where: { email },
      select: { id: true, isActive: true },
    });
    if (!user)
      fail(
        `No user ${email}; nothing changed. Create accounts with "pnpm user:create".`,
      );
    await confirm(
      `Reset the password of ${email}${user.isActive ? '' : ' (inactive account)'} in ${describeTarget()} and revoke all of its sessions?`,
      values.yes,
    );
    const passwordHash = await hashPassword(await readNewPassword());
    const revoked = await prisma.$transaction(async (tx) => {
      await tx.user.update({ where: { id: user.id }, data: { passwordHash } });
      const { count } = await tx.session.updateMany({
        where: { userId: user.id, revokedAt: null },
        data: { revokedAt: new Date() },
      });
      await tx.auditLog.create({
        data: {
          action: 'user.password_reset',
          entityType: 'user',
          entityId: user.id,
          metadata: { email, via: 'cli', sessionsRevoked: count },
        },
      });
      return count;
    });
    console.log(
      `Password reset for ${email} in ${describeTarget()}; ${revoked} session(s) revoked.`,
    );
  } catch (err) {
    fail((err as Error).message);
  } finally {
    await prisma.$disconnect();
  }
}

void main();
