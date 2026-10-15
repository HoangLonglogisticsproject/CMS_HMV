// Read-only overview of CMS accounts for troubleshooting sign-in (never prints password hashes).
//   pnpm --filter backend user:list
import { PrismaClient } from '@prisma/client';
import { describeTarget, fail, loadEnv } from './cli';

async function main() {
  loadEnv();
  console.log(`Database: ${describeTarget()}`);
  const prisma = new PrismaClient();
  try {
    const now = new Date();
    const users = await prisma.user.findMany({
      orderBy: { email: 'asc' },
      select: {
        email: true,
        isActive: true,
        lastLoginAt: true,
        roles: { select: { roleCode: true } },
        _count: {
          select: {
            sessions: { where: { revokedAt: null, expiresAt: { gt: now } } },
          },
        },
      },
    });
    console.table(
      users.map((u) => ({
        email: u.email,
        active: u.isActive,
        roles: u.roles.map((r) => r.roleCode).join(', '),
        lastLogin: u.lastLoginAt?.toISOString() ?? '-',
        activeSessions: u._count.sessions,
      })),
    );
  } catch (err) {
    fail((err as Error).message);
  } finally {
    await prisma.$disconnect();
  }
}

void main();
