import { Inject, Injectable } from '@nestjs/common';
import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import type { Request } from 'express';
import { audit } from '../../common/audit';
import { AppError } from '../../common/errors';
import { APP_CONFIG, type AppConfig } from '../../config';
import { PrismaService } from '../../infrastructure/database/prisma.service';
import type { AuthContext } from './auth.decorators';
import {
  DUMMY_HASH,
  hashPassword,
  passwordProblem,
  verifyPassword,
} from './password';

const sha256 = (value: string) =>
  createHash('sha256').update(value).digest('hex');

export function safeEqual(a: string | undefined, b: string): boolean {
  if (!a) return false;
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

function readCookie(
  header: string | undefined,
  name: string,
): string | undefined {
  for (const part of (header ?? '').split(';')) {
    const i = part.indexOf('=');
    if (i > 0 && part.slice(0, i).trim() === name)
      return part.slice(i + 1).trim();
  }
  return undefined;
}

/**
 * Fixed-window attempt counter.
 * ponytail: in-process memory, so limits are per API instance and reset on restart.
 * Move to Redis/Postgres when the API runs more than one instance.
 */
export class FixedWindowLimiter {
  private readonly hits = new Map<string, { count: number; resetAt: number }>();

  constructor(
    private readonly limit: number,
    private readonly windowMs: number,
  ) {}

  /** Records one attempt. Returns seconds until retry when over the limit, otherwise 0. */
  consume(key: string, now = Date.now()): number {
    let entry = this.hits.get(key);
    if (!entry || entry.resetAt <= now) {
      entry = { count: 0, resetAt: now + this.windowMs };
      this.hits.set(key, entry);
      if (this.hits.size > 10_000) {
        for (const [k, e] of this.hits)
          if (e.resetAt <= now) this.hits.delete(k);
      }
    }
    entry.count++;
    return entry.count > this.limit
      ? Math.ceil((entry.resetAt - now) / 1000)
      : 0;
  }

  reset(key: string) {
    this.hits.delete(key);
  }

  /** Gives back one attempt (e.g. after a successful login). */
  refund(key: string) {
    const entry = this.hits.get(key);
    if (entry && entry.count > 0) entry.count--;
  }
}

const SESSION_INCLUDE = {
  user: {
    include: {
      roles: {
        include: {
          role: {
            include: { permissions: { select: { permissionCode: true } } },
          },
        },
      },
    },
  },
} as const;

@Injectable()
export class AuthService {
  // Attempts are counted before the password check (so parallel requests cannot slip past) and
  // successful logins are given back. Per IP: slows credential stuffing. Per IP+email: slows guessing
  // one account without letting a single attacker lock that account out for everyone.
  private readonly ipLimiter = new FixedWindowLimiter(20, 15 * 60_000);
  private readonly accountLimiter = new FixedWindowLimiter(5, 15 * 60_000);
  // Wrong current passwords per user: a hijacked session cannot brute-force the password it needs to take over.
  private readonly passwordLimiter = new FixedWindowLimiter(5, 15 * 60_000);

  constructor(
    private readonly prisma: PrismaService,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
  ) {}

  get cookieName() {
    // __Host- forces Secure, Path=/ and no Domain, so subdomains cannot plant or read it.
    return this.config.isProduction ? '__Host-hmv_session' : 'hmv_session';
  }

  get cookieOptions() {
    return {
      httpOnly: true,
      secure: this.config.isProduction,
      sameSite: 'lax' as const,
      path: '/',
    };
  }

  assertAllowedOrigin(req: Request) {
    const origin = req.headers.origin;
    // Browsers always send Origin on cross-origin and same-origin unsafe requests; its absence means a non-browser client.
    if (origin && !this.config.corsOrigins.includes(origin)) {
      throw new AppError(
        403,
        'ORIGIN_NOT_ALLOWED',
        `Origin ${origin} is not allowed`,
      );
    }
  }

  async login(
    emailInput: string,
    password: string,
    ip: string | undefined,
    userAgent: string | undefined,
  ) {
    const email = emailInput.trim().toLowerCase();
    const retryAfterSeconds = Math.max(
      this.ipLimiter.consume(`ip:${ip}`),
      this.accountLimiter.consume(`acct:${ip}:${email}`),
    );
    if (retryAfterSeconds) {
      throw new AppError(
        429,
        'RATE_LIMITED',
        'Too many login attempts, try again later',
        { retryAfterSeconds },
      );
    }

    const user = await this.prisma.user.findUnique({ where: { email } });
    const passwordOk = await verifyPassword(
      password,
      user?.passwordHash ?? DUMMY_HASH,
    );
    if (!user || !passwordOk || !user.isActive) {
      await audit(
        this.prisma,
        { userId: user?.id, ip },
        'auth.login_failed',
        'user',
        user?.id,
        { email },
      );
      throw new AppError(
        401,
        'INVALID_CREDENTIALS',
        'Email or password is incorrect',
      );
    }
    this.ipLimiter.refund(`ip:${ip}`);
    this.accountLimiter.reset(`acct:${ip}:${email}`);

    const token = randomBytes(32).toString('base64url');
    const now = new Date();
    const session = await this.prisma.$transaction(async (tx) => {
      // Housekeeping: drop this user's dead sessions so the table does not grow forever.
      await tx.session.deleteMany({
        where: {
          userId: user.id,
          OR: [{ expiresAt: { lte: now } }, { revokedAt: { not: null } }],
        },
      });
      const created = await tx.session.create({
        data: {
          id: sha256(token),
          userId: user.id,
          csrfToken: randomBytes(32).toString('base64url'),
          expiresAt: new Date(now.getTime() + this.config.sessionTtlMs),
          ipAddress: ip,
          userAgent: userAgent?.slice(0, 512),
        },
        include: SESSION_INCLUDE,
      });
      await tx.user.update({
        where: { id: user.id },
        data: { lastLoginAt: now },
      });
      await audit(
        tx,
        { userId: user.id, ip },
        'auth.login',
        'session',
        created.id.slice(0, 12),
      );
      return created;
    });
    return { token, auth: this.toContext(session, ip) };
  }

  async authenticate(req: Request): Promise<AuthContext> {
    const token = readCookie(req.headers.cookie, this.cookieName);
    if (!token) throw new AppError(401, 'UNAUTHENTICATED', 'Sign in required');
    const session = await this.prisma.session.findUnique({
      where: { id: sha256(token) },
      include: SESSION_INCLUDE,
    });
    if (
      !session ||
      session.revokedAt ||
      session.expiresAt <= new Date() ||
      !session.user.isActive
    ) {
      throw new AppError(
        401,
        'UNAUTHENTICATED',
        'Session is invalid or expired',
      );
    }
    return this.toContext(session, req.ip);
  }

  /**
   * Self-service change: requires the current password; keeps this session and revokes every other session of the
   * user (a stolen session elsewhere stops working). Returns the number of revoked sessions.
   */
  async changePassword(
    auth: AuthContext,
    currentPassword: string,
    newPassword: string,
  ): Promise<number> {
    const problem =
      passwordProblem(newPassword) ??
      (newPassword === currentPassword
        ? 'New password must differ from the current one'
        : null);
    if (problem)
      throw new AppError(
        400,
        'VALIDATION_FAILED',
        'Request validation failed',
        [{ path: 'newPassword', message: problem }],
      );

    const key = `pwd:${auth.userId}`;
    const retryAfterSeconds = this.passwordLimiter.consume(key);
    if (retryAfterSeconds)
      throw new AppError(
        429,
        'RATE_LIMITED',
        'Too many attempts, try again later',
        { retryAfterSeconds },
      );
    const user = await this.prisma.user.findUniqueOrThrow({
      where: { id: auth.userId },
      select: { passwordHash: true },
    });
    if (!(await verifyPassword(currentPassword, user.passwordHash))) {
      await audit(
        this.prisma,
        { userId: auth.userId, ip: auth.ip },
        'auth.password_change_failed',
        'user',
        auth.userId,
      );
      throw new AppError(
        403,
        'CURRENT_PASSWORD_INCORRECT',
        'Current password is incorrect',
      );
    }
    this.passwordLimiter.reset(key);

    const passwordHash = await hashPassword(newPassword);
    return this.prisma.$transaction(async (tx) => {
      await tx.user.update({
        where: { id: auth.userId },
        data: { passwordHash },
      });
      const { count } = await tx.session.updateMany({
        where: {
          userId: auth.userId,
          revokedAt: null,
          id: { not: auth.sessionId },
        },
        data: { revokedAt: new Date() },
      });
      await audit(
        tx,
        { userId: auth.userId, ip: auth.ip },
        'auth.password_change',
        'user',
        auth.userId,
        { sessionsRevoked: count },
      );
      return count;
    });
  }

  async logout(auth: AuthContext) {
    await this.prisma.$transaction([
      this.prisma.session.update({
        where: { id: auth.sessionId },
        data: { revokedAt: new Date() },
      }),
      this.prisma.auditLog.create({
        data: {
          actorId: auth.userId,
          ipAddress: auth.ip,
          action: 'auth.logout',
          entityType: 'session',
          entityId: auth.sessionId.slice(0, 12),
        },
      }),
    ]);
  }

  private toContext(
    session: {
      id: string;
      csrfToken: string;
      expiresAt: Date;
      user: {
        id: string;
        email: string;
        displayName: string;
        roles: {
          roleCode: string;
          role: { permissions: { permissionCode: string }[] };
        }[];
      };
    },
    ip?: string,
  ): AuthContext {
    return {
      userId: session.user.id,
      email: session.user.email,
      displayName: session.user.displayName,
      roles: session.user.roles.map((r) => r.roleCode),
      permissions: new Set(
        session.user.roles.flatMap((r) =>
          r.role.permissions.map((p) => p.permissionCode),
        ),
      ),
      sessionId: session.id,
      csrfToken: session.csrfToken,
      expiresAt: session.expiresAt,
      ip,
    };
  }
}
