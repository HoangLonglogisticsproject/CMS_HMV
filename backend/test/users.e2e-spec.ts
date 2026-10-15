import request from 'supertest';
import {
  expectContract,
  PASSWORD,
  type Session,
  setupApp,
  type TestApp,
} from './helpers';

const NEW_PASSWORD = 'freshly issued passphrase 9';
const MISSING_ID = '01a00000-0000-7000-8000-000000000000';
const newArticle = (slug: string) => ({
  categoryCode: 'SUPPLY_CHAIN_INSIGHTS',
  translations: [{ locale: 'vi', title: 'Bài viết thử quyền', slug }],
});

describe('User management API (PostgreSQL)', () => {
  let t: TestApp;
  let admin: Session;
  const login = (email: string, password = PASSWORD) =>
    request(t.http).post('/api/v1/auth/login').send({ email, password });

  beforeAll(async () => {
    t = await setupApp();
  });
  beforeEach(async () => {
    await t.reset();
    admin = await t.signIn('ADMIN');
  });
  afterAll(() => t.app.close());

  it('is ADMIN-only on the server: other roles get 403 everywhere and cannot grant themselves ADMIN', async () => {
    for (const role of ['EDITOR', 'REVIEWER', 'VIEWER']) {
      const s = await t.signIn(role);
      const calls = [
        s.get('/api/v1/admin/users'),
        s.get('/api/v1/admin/roles'),
        s.get('/api/v1/admin/security-events'),
        s.post('/api/v1/admin/users', {
          email: `x-${role}@hmv.test`,
          displayName: 'X',
          roles: ['ADMIN'],
          password: NEW_PASSWORD,
        }),
        s.patch(`/api/v1/admin/users/${s.user.id}`, { roles: ['ADMIN'] }),
        s.post(`/api/v1/admin/users/${admin.user.id}/password`, {
          newPassword: NEW_PASSWORD,
        }),
        s.post(`/api/v1/admin/users/${admin.user.id}/sessions/revoke`),
      ];
      for (const res of await Promise.all(calls)) {
        expect(res.status).toBe(403);
        expect(res.body.code).toBe('PERMISSION_DENIED');
      }
      const roles = await t.prisma.userRole.findMany({
        where: { userId: s.user.id },
      });
      expect(roles.map((r) => r.roleCode)).toEqual([role]);
    }
    await admin.get('/api/v1/auth/session').expect(200);
  });

  it('lists users and roles without hashes or tokens', async () => {
    const res = await admin.get('/api/v1/admin/users').expect(200);
    expectContract(res.body, 'UserListResponse');
    expect(res.body.items[0]).toMatchObject({
      email: admin.user.email,
      roles: ['ADMIN'],
      isActive: true,
      activeSessions: 1,
    });
    expect(JSON.stringify(res.body)).not.toMatch(/scrypt|passwordHash|csrf/i);
    const roles = await admin.get('/api/v1/admin/roles').expect(200);
    expectContract(roles.body, 'RoleListResponse');
    const adminRole = roles.body.items.find(
      (r: { code: string }) => r.code === 'ADMIN',
    );
    expect(adminRole.permissions).toContain('user:manage');
    const editorRole = roles.body.items.find(
      (r: { code: string }) => r.code === 'EDITOR',
    );
    expect(editorRole.permissions).not.toContain('user:manage');
  });

  it('creates users, never overwrites an existing one, and validates input', async () => {
    const created = await admin
      .post('/api/v1/admin/users', {
        email: 'Staff@HMV.test',
        displayName: 'Nhân viên',
        roles: ['EDITOR'],
        password: NEW_PASSWORD,
      })
      .expect(201);
    expectContract(created.body, 'AdminUserResponse');
    expect(created.body).toMatchObject({
      email: 'staff@hmv.test',
      roles: ['EDITOR'],
      activeSessions: 0,
    });
    await login('staff@hmv.test', NEW_PASSWORD).expect(200);

    const before = await t.prisma.user.findUniqueOrThrow({
      where: { email: 'staff@hmv.test' },
    });
    const dup = await admin
      .post('/api/v1/admin/users', {
        email: 'STAFF@hmv.test',
        displayName: 'Overwrite',
        roles: ['ADMIN'],
        password: 'some other passphrase',
      })
      .expect(409);
    expect(dup.body.code).toBe('EMAIL_TAKEN');
    expect(
      await t.prisma.user.findUniqueOrThrow({
        where: { email: 'staff@hmv.test' },
      }),
    ).toEqual(before);

    const unknownRole = await admin
      .post('/api/v1/admin/users', {
        email: 'r@hmv.test',
        displayName: 'R',
        roles: ['GOD_MODE'],
        password: NEW_PASSWORD,
      })
      .expect(400);
    expect(unknownRole.body.code).toBe('UNKNOWN_ROLE');
    await admin
      .post('/api/v1/admin/users', {
        email: 'w@hmv.test',
        displayName: 'W',
        roles: ['EDITOR'],
        password: 'short',
      })
      .expect(400);
    const audit = await t.prisma.auditLog.findFirstOrThrow({
      where: { action: 'user.create' },
    });
    expect(audit).toMatchObject({
      actorId: admin.user.id,
      entityId: created.body.id,
      metadata: { via: 'admin', roles: ['EDITOR'] },
    });
  });

  it('role changes apply to existing sessions immediately, both ways', async () => {
    const viewer = await t.signIn('VIEWER');
    await viewer
      .post('/api/v1/admin/articles', newArticle('quyen-1'))
      .expect(403);

    await admin
      .patch(`/api/v1/admin/users/${viewer.user.id}`, { roles: ['EDITOR'] })
      .expect(200);
    await viewer
      .post('/api/v1/admin/articles', newArticle('quyen-2'))
      .expect(201);

    await admin
      .patch(`/api/v1/admin/users/${viewer.user.id}`, { roles: ['VIEWER'] })
      .expect(200);
    await viewer
      .post('/api/v1/admin/articles', newArticle('quyen-3'))
      .expect(403);
    const audits = await t.prisma.auditLog.findMany({
      where: { action: 'user.roles_change', entityId: viewer.user.id },
      orderBy: { createdAt: 'asc' },
    });
    expect(audits.map((a) => a.metadata)).toEqual([
      { email: viewer.user.email, from: ['VIEWER'], to: ['EDITOR'] },
      { email: viewer.user.email, from: ['EDITOR'], to: ['VIEWER'] },
    ]);
  });

  it('deactivation signs the user out and blocks sign-in until reactivated', async () => {
    const editor = await t.signIn('EDITOR');
    const res = await admin
      .patch(`/api/v1/admin/users/${editor.user.id}`, { isActive: false })
      .expect(200);
    expect(res.body).toMatchObject({ isActive: false, activeSessions: 0 });
    await editor.get('/api/v1/auth/session').expect(401);
    const denied = await login(editor.user.email).expect(401);
    expect(denied.body.code).toBe('INVALID_CREDENTIALS');

    await admin
      .patch(`/api/v1/admin/users/${editor.user.id}`, { isActive: true })
      .expect(200);
    await login(editor.user.email).expect(200);
    const actions = (
      await t.prisma.auditLog.findMany({
        where: { entityId: editor.user.id, action: { startsWith: 'user.' } },
        orderBy: { createdAt: 'asc' },
      })
    ).map((a) => [a.action, a.metadata]);
    expect(actions).toEqual([
      ['user.deactivate', { email: editor.user.email, sessionsRevoked: 1 }],
      ['user.reactivate', { email: editor.user.email, sessionsRevoked: 0 }],
    ]);
  });

  it('administrator password reset revokes the sessions and leaves roles and status alone', async () => {
    const reviewer = await t.signIn('REVIEWER');
    await admin
      .post(`/api/v1/admin/users/${reviewer.user.id}/password`, {
        newPassword: NEW_PASSWORD,
      })
      .expect(204);
    await reviewer.get('/api/v1/auth/session').expect(401);
    await login(reviewer.user.email).expect(401);
    await login(reviewer.user.email, NEW_PASSWORD).expect(200);
    const after = await t.prisma.user.findUniqueOrThrow({
      where: { id: reviewer.user.id },
      include: { roles: true },
    });
    expect(after).toMatchObject({ isActive: true });
    expect(after.roles.map((r) => r.roleCode)).toEqual(['REVIEWER']);
    const audit = await t.prisma.auditLog.findFirstOrThrow({
      where: { action: 'user.password_reset' },
    });
    expect(audit).toMatchObject({
      actorId: admin.user.id,
      metadata: { via: 'admin', sessionsRevoked: 1 },
    });
    expect(JSON.stringify(audit)).not.toContain(NEW_PASSWORD);
  });

  it('revokes sessions on demand', async () => {
    const editor = await t.signIn('EDITOR');
    const res = await admin
      .post(`/api/v1/admin/users/${editor.user.id}/sessions/revoke`)
      .expect(200);
    expect(res.body).toEqual({ revoked: 1 });
    await editor.get('/api/v1/auth/session').expect(401);
    await login(editor.user.email).expect(200); // the account itself still works
  });

  it('never leaves the system without an active user manager (LAST_ADMIN)', async () => {
    for (const change of [{ isActive: false }, { roles: ['EDITOR'] }]) {
      const res = await admin
        .patch(`/api/v1/admin/users/${admin.user.id}`, change)
        .expect(409);
      expect(res.body.code).toBe('LAST_ADMIN');
    }
    await admin.get('/api/v1/admin/users').expect(200); // still an admin

    const second = await t.signIn('ADMIN');
    await admin
      .patch(`/api/v1/admin/users/${second.user.id}`, { roles: ['EDITOR'] })
      .expect(200);
    await admin
      .patch(`/api/v1/admin/users/${second.user.id}`, { roles: ['ADMIN'] })
      .expect(200);

    // Two admins demoting each other at the same time: exactly one may win.
    const [a, b] = await Promise.all([
      admin.patch(`/api/v1/admin/users/${second.user.id}`, {
        roles: ['EDITOR'],
      }),
      second.patch(`/api/v1/admin/users/${admin.user.id}`, {
        roles: ['EDITOR'],
      }),
    ]);
    // The loser is refused either by the LAST_ADMIN check (409) or, if it started after the winner committed, by the
    // guard because it no longer holds user:manage (403). Either way one admin remains.
    const statuses = [a.status, b.status];
    expect(statuses.filter((s) => s === 200)).toHaveLength(1);
    expect([403, 409]).toContain(statuses.find((s) => s !== 200));
    const managers = await t.prisma.user.count({
      where: { isActive: true, roles: { some: { roleCode: 'ADMIN' } } },
    });
    expect(managers).toBe(1);
  });

  it('answers 404 for unknown users and lists security events without secrets', async () => {
    const missing = await admin
      .patch(`/api/v1/admin/users/${MISSING_ID}`, { isActive: false })
      .expect(404);
    expect(missing.body.code).toBe('USER_NOT_FOUND');

    await login(admin.user.email, 'wrong password').expect(401);
    await admin
      .post('/api/v1/admin/users', {
        email: 'audit@hmv.test',
        displayName: 'A',
        roles: ['VIEWER'],
        password: NEW_PASSWORD,
      })
      .expect(201);
    const res = await admin.get('/api/v1/admin/security-events').expect(200);
    expectContract(res.body, 'SecurityEventListResponse');
    const actions = res.body.items.map((e: { action: string }) => e.action);
    expect(actions).toEqual(
      expect.arrayContaining([
        'user.create',
        'auth.login_failed',
        'auth.login',
      ]),
    );
    expect(res.body.items[0]).toMatchObject({
      action: 'user.create',
      actorEmail: admin.user.email,
      targetEmail: 'audit@hmv.test',
    });
    expect(JSON.stringify(res.body)).not.toMatch(
      new RegExp(`${NEW_PASSWORD}|wrong password|scrypt`),
    );
  });
});
