import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { type Actor, audit } from '../../common/audit';
import { AppError } from '../../common/errors';
import { PrismaService } from '../../infrastructure/database/prisma.service';
import { hashPassword, passwordProblem } from '../auth/password';
import type {
  AdminUserResponse,
  CreateUserDto,
  RoleListResponse,
  SecurityEventListResponse,
  UpdateUserDto,
  UserListResponse,
} from './users.dto';

type Tx = Prisma.TransactionClient;

/** The permission whose last active holder must never be removed: without it nobody can manage accounts. */
const MANAGE = 'user:manage';

const userSelect = (now: Date) =>
  ({
    id: true,
    email: true,
    displayName: true,
    isActive: true,
    lastLoginAt: true,
    createdAt: true,
    roles: { select: { roleCode: true }, orderBy: { roleCode: 'asc' } },
    _count: {
      select: {
        sessions: { where: { revokedAt: null, expiresAt: { gt: now } } },
      },
    },
  }) satisfies Prisma.UserSelect;

type UserRow = Prisma.UserGetPayload<{ select: ReturnType<typeof userSelect> }>;

const toResponse = (u: UserRow): AdminUserResponse => ({
  id: u.id,
  email: u.email,
  displayName: u.displayName,
  isActive: u.isActive,
  roles: u.roles.map((r) => r.roleCode),
  lastLoginAt: u.lastLoginAt,
  createdAt: u.createdAt,
  activeSessions: u._count.sessions,
});

const validation = (path: string, message: string) =>
  new AppError(400, 'VALIDATION_FAILED', 'Request validation failed', [
    { path, message },
  ]);

const revokeAll = (tx: Tx, userId: string) =>
  tx.session.updateMany({
    where: { userId, revokedAt: null },
    data: { revokedAt: new Date() },
  });

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  async list(): Promise<UserListResponse> {
    const users = await this.prisma.user.findMany({
      orderBy: { email: 'asc' },
      select: userSelect(new Date()),
    });
    return { items: users.map(toResponse) };
  }

  async get(id: string): Promise<AdminUserResponse> {
    const user = await this.prisma.user.findUnique({
      where: { id },
      select: userSelect(new Date()),
    });
    if (!user) throw new AppError(404, 'USER_NOT_FOUND', 'User not found');
    return toResponse(user);
  }

  async roles(): Promise<RoleListResponse> {
    const roles = await this.prisma.role.findMany({
      orderBy: { code: 'asc' },
      include: { permissions: { select: { permissionCode: true } } },
    });
    return {
      items: roles.map((r) => ({
        code: r.code,
        name: r.name,
        description: r.description,
        permissions: r.permissions
          .map((p) => p.permissionCode)
          .sort() as RoleListResponse['items'][number]['permissions'],
      })),
    };
  }

  async create(dto: CreateUserDto, actor: Actor): Promise<AdminUserResponse> {
    const email = dto.email.trim().toLowerCase();
    const roles = [...new Set(dto.roles)];
    const problem = passwordProblem(dto.password);
    if (problem) throw validation('password', problem);
    await this.assertRoles(this.prisma, roles);
    const passwordHash = await hashPassword(dto.password);
    try {
      const user = await this.prisma.$transaction(async (tx) => {
        const u = await tx.user.create({
          data: {
            email,
            displayName: dto.displayName.trim(),
            passwordHash,
            roles: { create: roles.map((roleCode) => ({ roleCode })) },
          },
        });
        await audit(tx, actor, 'user.create', 'user', u.id, {
          email,
          roles,
          via: 'admin',
        });
        return u;
      });
      return this.get(user.id);
    } catch (err) {
      if (
        err instanceof Prisma.PrismaClientKnownRequestError &&
        err.code === 'P2002'
      )
        throw new AppError(409, 'EMAIL_TAKEN', `User ${email} already exists`);
      throw err;
    }
  }

  /**
   * Name, roles and the active flag, each change audited separately. Deactivating revokes every session. Refuses to
   * leave no active user with `user:manage` (LAST_ADMIN); serializable so two concurrent demotions cannot both pass.
   */
  async update(
    id: string,
    dto: UpdateUserDto,
    actor: Actor,
  ): Promise<AdminUserResponse> {
    await this.serializable(async (tx) => {
      const user = await tx.user.findUnique({
        where: { id },
        include: { roles: { select: { roleCode: true } } },
      });
      if (!user) throw new AppError(404, 'USER_NOT_FOUND', 'User not found');
      const fromRoles = user.roles.map((r) => r.roleCode).sort();
      const toRoles = dto.roles ? [...new Set(dto.roles)].sort() : fromRoles;
      const rolesChanged = fromRoles.join() !== toRoles.join();
      const isActive = dto.isActive ?? user.isActive;
      if (rolesChanged) await this.assertRoles(tx, toRoles);

      const keepsManage = isActive && (await this.grantsManage(tx, toRoles));
      if (
        user.isActive &&
        !keepsManage &&
        (await this.grantsManage(tx, fromRoles))
      ) {
        const others = await tx.user.count({
          where: {
            id: { not: id },
            isActive: true,
            roles: {
              some: {
                role: { permissions: { some: { permissionCode: MANAGE } } },
              },
            },
          },
        });
        if (others === 0)
          throw new AppError(
            409,
            'LAST_ADMIN',
            'At least one active user must keep user management access',
          );
      }

      const name = dto.displayName?.trim();
      if (name && name !== user.displayName) {
        await tx.user.update({ where: { id }, data: { displayName: name } });
        await audit(tx, actor, 'user.rename', 'user', id, {
          email: user.email,
        });
      }
      if (rolesChanged) {
        await tx.userRole.deleteMany({ where: { userId: id } });
        await tx.userRole.createMany({
          data: toRoles.map((roleCode) => ({ userId: id, roleCode })),
        });
        // Permissions are read per request, so the change applies to existing sessions immediately.
        await audit(tx, actor, 'user.roles_change', 'user', id, {
          email: user.email,
          from: fromRoles,
          to: toRoles,
        });
      }
      if (isActive !== user.isActive) {
        await tx.user.update({ where: { id }, data: { isActive } });
        const sessionsRevoked = isActive ? 0 : (await revokeAll(tx, id)).count;
        await audit(
          tx,
          actor,
          isActive ? 'user.reactivate' : 'user.deactivate',
          'user',
          id,
          { email: user.email, sessionsRevoked },
        );
      }
    });
    return this.get(id);
  }

  /** Administrator-initiated reset: new password, every session revoked. Roles and status are untouched. */
  async setPassword(id: string, newPassword: string, actor: Actor) {
    const problem = passwordProblem(newPassword);
    if (problem) throw validation('newPassword', problem);
    const passwordHash = await hashPassword(newPassword);
    await this.prisma.$transaction(async (tx) => {
      const user = await tx.user.findUnique({
        where: { id },
        select: { email: true },
      });
      if (!user) throw new AppError(404, 'USER_NOT_FOUND', 'User not found');
      await tx.user.update({ where: { id }, data: { passwordHash } });
      const { count } = await revokeAll(tx, id);
      await audit(tx, actor, 'user.password_reset', 'user', id, {
        email: user.email,
        via: 'admin',
        sessionsRevoked: count,
      });
    });
  }

  async revokeSessions(id: string, actor: Actor): Promise<number> {
    return this.prisma.$transaction(async (tx) => {
      const user = await tx.user.findUnique({
        where: { id },
        select: { email: true },
      });
      if (!user) throw new AppError(404, 'USER_NOT_FOUND', 'User not found');
      const { count } = await revokeAll(tx, id);
      await audit(tx, actor, 'user.sessions_revoke', 'user', id, {
        email: user.email,
        sessionsRevoked: count,
      });
      return count;
    });
  }

  /** Recent `auth.*` / `user.*` audit rows with actor and target emails resolved. */
  async securityEvents(limit: number): Promise<SecurityEventListResponse> {
    const rows = await this.prisma.auditLog.findMany({
      where: {
        OR: [
          { action: { startsWith: 'auth.' } },
          { action: { startsWith: 'user.' } },
        ],
      },
      orderBy: { createdAt: 'desc' },
      take: limit,
    });
    const ids = [
      ...new Set(
        rows.flatMap((r) => [
          r.actorId,
          r.entityType === 'user' ? r.entityId : null,
        ]),
      ),
    ].filter((x): x is string => Boolean(x));
    const users = await this.prisma.user.findMany({
      where: { id: { in: ids } },
      select: { id: true, email: true },
    });
    const emailOf = (id: string | null) =>
      (id && users.find((u) => u.id === id)?.email) ?? null;
    return {
      items: rows.map((r) => ({
        id: r.id,
        action: r.action,
        createdAt: r.createdAt,
        actorEmail: emailOf(r.actorId),
        targetEmail: r.entityType === 'user' ? emailOf(r.entityId) : null,
        ipAddress: r.ipAddress,
        metadata: (r.metadata as Record<string, unknown> | null) ?? null,
      })),
    };
  }

  private async assertRoles(db: Tx | PrismaService, roles: string[]) {
    const known = await db.role.findMany({
      where: { code: { in: roles } },
      select: { code: true },
    });
    const unknown = roles.filter((r) => !known.some((k) => k.code === r));
    if (unknown.length)
      throw new AppError(
        400,
        'UNKNOWN_ROLE',
        `Unknown role(s): ${unknown.join(', ')}`,
        {
          roles: unknown,
        },
      );
  }

  private async grantsManage(tx: Tx, roles: string[]) {
    return (
      (await tx.rolePermission.count({
        where: { roleCode: { in: roles }, permissionCode: MANAGE },
      })) > 0
    );
  }

  private async serializable<T>(fn: (tx: Tx) => Promise<T>): Promise<T> {
    for (let attempt = 1; ; attempt++) {
      try {
        return await this.prisma.$transaction(fn, {
          isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
        });
      } catch (err) {
        const retry =
          err instanceof Prisma.PrismaClientKnownRequestError &&
          err.code === 'P2034' &&
          attempt < 5;
        if (!retry) throw err;
      }
    }
  }
}
