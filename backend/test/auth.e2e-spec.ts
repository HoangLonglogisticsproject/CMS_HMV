import request from 'supertest';
import { expectContract, PASSWORD, setupApp, type TestApp } from './helpers';

const login = (t: TestApp, email: string, password = PASSWORD) =>
  request(t.http).post('/api/v1/auth/login').send({ email, password });
const tokenOf = (res: request.Response) =>
  (res.headers['set-cookie'] as unknown as string[])[0]
    .split(';')[0]
    .split('=')[1];

describe('Authentication & RBAC (PostgreSQL)', () => {
  let t: TestApp;

  beforeAll(async () => {
    t = await setupApp();
    await t.reset();
  });
  afterAll(() => t.app.close());

  it('logs in with an HttpOnly session cookie and stores only a hash of the token', async () => {
    const user = await t.createUser(['EDITOR']);
    const res = await login(t, user.email.toUpperCase()).expect(200);
    expectContract(res.body, 'SessionResponse');

    const cookie = (res.headers['set-cookie'] as unknown as string[])[0];
    expect(cookie).toMatch(/^hmv_session=[\w-]{43}; /);
    expect(cookie).toMatch(/; HttpOnly/);
    expect(cookie).toMatch(/; SameSite=Lax/);
    expect(cookie).toMatch(/; Path=\//);
    expect(res.body.user.permissions).toEqual([
      'article:read',
      'article:write',
      'media:read',
      'media:write',
      'page:read',
      'page:write',
    ]);
    expect(res.body.csrfToken).toHaveLength(43);

    const token = tokenOf(res);
    expect(await t.prisma.session.count({ where: { id: token } })).toBe(0);
    expect(await t.prisma.session.count({ where: { userId: user.id } })).toBe(
      1,
    );

    const me = await request(t.http)
      .get('/api/v1/auth/session')
      .set('Cookie', `hmv_session=${token}`)
      .expect(200);
    expect(me.body.user.email).toBe(user.email);
    expect(me.body.csrfToken).toBe(res.body.csrfToken);
  });

  it('answers wrong password, unknown email and inactive user identically', async () => {
    const active = await t.createUser(['ADMIN']);
    const inactive = await t.createUser(['ADMIN'], { isActive: false });
    const bodies = await Promise.all([
      login(t, active.email, 'wrong password').expect(401),
      login(t, 'nobody@hmv.test').expect(401),
      login(t, inactive.email).expect(401),
    ]);
    for (const res of bodies)
      expect(res.body).toEqual({
        statusCode: 401,
        code: 'INVALID_CREDENTIALS',
        message: 'Email or password is incorrect',
      });
    expect(
      await t.prisma.auditLog.count({ where: { action: 'auth.login_failed' } }),
    ).toBeGreaterThanOrEqual(3);
  });

  it('protects every admin route and leaves the public API open', async () => {
    for (const [method, url] of [
      ['get', '/api/v1/admin/articles'],
      ['post', '/api/v1/admin/articles'],
      ['get', '/api/v1/admin/media'],
      ['get', '/api/v1/auth/session'],
    ] as const) {
      const res = await request(t.http)[method](url).expect(401);
      expect(res.body.code).toBe('UNAUTHENTICATED');
    }
    await request(t.http)
      .get('/api/v1/admin/articles')
      .set('Cookie', 'hmv_session=forged-token')
      .expect(401);
    await request(t.http).get('/api/v1/public/articles').expect(200);
    await request(t.http).get('/api/v1/health').expect(200);
  });

  it('requires the CSRF token on writes', async () => {
    const editor = await t.signIn('EDITOR');
    const body = {
      categoryCode: 'SUPPLY_CHAIN_INSIGHTS',
      translations: [{ locale: 'vi', title: 'T', slug: 'csrf-test' }],
    };
    expect(
      (await editor.agent.post('/api/v1/admin/articles').send(body).expect(403))
        .body.code,
    ).toBe('CSRF_TOKEN_INVALID');
    expect(
      (
        await editor.agent
          .post('/api/v1/admin/articles')
          .set('X-CSRF-Token', 'x'.repeat(43))
          .send(body)
          .expect(403)
      ).body.code,
    ).toBe('CSRF_TOKEN_INVALID');
    await editor.post('/api/v1/admin/articles', body).expect(201);
  });

  it('rejects unsafe requests from foreign origins, including login', async () => {
    const editor = await t.signIn('EDITOR');
    const res = await editor.agent
      .post('/api/v1/admin/articles')
      .set('Origin', 'https://evil.example')
      .set('X-CSRF-Token', editor.csrf)
      .send({});
    expect(res.status).toBe(403);
    expect(res.body.code).toBe('ORIGIN_NOT_ALLOWED');
    await request(t.http)
      .post('/api/v1/auth/login')
      .set('Origin', 'https://evil.example')
      .send({ email: 'a@b.c', password: 'x' })
      .expect(403);
    await editor.agent
      .get('/api/v1/admin/articles')
      .set('Origin', 'https://evil.example')
      .expect(200); // reads are not state-changing
  });

  it('checks permissions, not role names', async () => {
    const viewer = await t.signIn('VIEWER');
    const editor = await t.signIn('EDITOR');
    const reviewer = await t.signIn('REVIEWER');
    const id = '0199f3a0-0000-7000-8000-00000000abcd';

    await viewer.get('/api/v1/admin/articles').expect(200);
    const denied = await viewer.post('/api/v1/admin/articles', {}).expect(403);
    expect(denied.body).toMatchObject({
      code: 'PERMISSION_DENIED',
      details: { missing: ['article:write'] },
    });
    await viewer.upload('/api/v1/admin/media').expect(403);
    expect(
      (
        await editor
          .post(`/api/v1/admin/articles/${id}/publish`, { expectedRevision: 1 })
          .expect(403)
      ).body.details.missing,
    ).toEqual(['article:publish']);
    await editor
      .post(`/api/v1/admin/articles/${id}/translations/vi/approve`, {
        expectedRevision: 1,
      })
      .expect(403);
    await editor.post(`/api/v1/admin/articles/${id}/archive`).expect(403);
    await reviewer.post('/api/v1/admin/articles', {}).expect(403);
    await reviewer.upload('/api/v1/admin/media').expect(403);

    // Permissions come from role_permissions rows: granting one to VIEWER takes effect without a code change.
    await t.prisma.rolePermission.create({
      data: { roleCode: 'VIEWER', permissionCode: 'media:write' },
    });
    try {
      const res = await viewer.upload('/api/v1/admin/media').expect(400);
      expect(res.body.code).toBe('FILE_REQUIRED');
    } finally {
      await t.prisma.rolePermission.delete({
        where: {
          roleCode_permissionCode: {
            roleCode: 'VIEWER',
            permissionCode: 'media:write',
          },
        },
      });
    }
  });

  it('revokes the session on logout', async () => {
    const editor = await t.signIn('EDITOR');
    const res = await editor.post('/api/v1/auth/logout').expect(204);
    expect((res.headers['set-cookie'] as unknown as string[])[0]).toMatch(
      /^hmv_session=;.*Expires=Thu, 01 Jan 1970/,
    );
    expect(
      await t.prisma.session.findFirstOrThrow({
        where: { userId: editor.user.id },
      }),
    ).toMatchObject({ revokedAt: expect.any(Date) });
    await editor.get('/api/v1/auth/session').expect(401);
  });

  it('rejects expired sessions and deactivated users', async () => {
    const a = await t.signIn('EDITOR');
    await t.prisma.session.updateMany({
      where: { userId: a.user.id },
      data: { expiresAt: new Date(Date.now() - 1000) },
    });
    await a.get('/api/v1/auth/session').expect(401);

    const b = await t.signIn('EDITOR');
    await t.prisma.user.update({
      where: { id: b.user.id },
      data: { isActive: false },
    });
    await b.get('/api/v1/admin/articles').expect(401);
  });

  it('rate-limits repeated failures for one account', async () => {
    const user = await t.createUser(['EDITOR']);
    for (let i = 0; i < 5; i++) await login(t, user.email, 'wrong').expect(401);
    const limited = await login(t, user.email).expect(429); // even the right password waits out the window
    expect(limited.body.code).toBe('RATE_LIMITED');
    expect(Number(limited.headers['retry-after'])).toBeGreaterThan(0);
  });

  it('writes an audit trail for logins', async () => {
    const editor = await t.signIn('EDITOR');
    const rows = await t.prisma.auditLog.findMany({
      where: { actorId: editor.user.id },
    });
    expect(rows.map((r) => r.action)).toContain('auth.login');
    expect(rows[0].ipAddress).toBeTruthy();
  });
});
