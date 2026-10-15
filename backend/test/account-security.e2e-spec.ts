import request from 'supertest';
import { PASSWORD, setupApp, type TestApp } from './helpers';

const NEW_PASSWORD = 'another long passphrase 7';

describe('Account security: password change (PostgreSQL)', () => {
  let t: TestApp;
  const login = (email: string, password: string) =>
    request(t.http).post('/api/v1/auth/login').send({ email, password });

  beforeAll(async () => {
    t = await setupApp();
  });
  beforeEach(() => t.reset());
  afterAll(() => t.app.close());

  it('changes the password: this session stays, other sessions are revoked, the change is audited', async () => {
    const me = await t.signIn('EDITOR');
    const otherTab = request.agent(t.http);
    await otherTab
      .post('/api/v1/auth/login')
      .send({ email: me.user.email, password: PASSWORD })
      .expect(200);

    await me
      .post('/api/v1/auth/password', {
        currentPassword: PASSWORD,
        newPassword: NEW_PASSWORD,
      })
      .expect(204);

    await me.get('/api/v1/auth/session').expect(200);
    await otherTab.get('/api/v1/auth/session').expect(401);
    await login(me.user.email, PASSWORD).expect(401);
    await login(me.user.email, NEW_PASSWORD).expect(200);
    const audit = await t.prisma.auditLog.findFirstOrThrow({
      where: { action: 'auth.password_change' },
    });
    expect(audit).toMatchObject({
      actorId: me.user.id,
      entityId: me.user.id,
      metadata: { sessionsRevoked: 1 },
    });
    expect(JSON.stringify(audit)).not.toContain(NEW_PASSWORD);
  });

  it('a wrong current password is 403 (not 401: the session is fine) and changes nothing', async () => {
    const me = await t.signIn('EDITOR');
    const before = await t.prisma.user.findUniqueOrThrow({
      where: { id: me.user.id },
    });
    const res = await me
      .post('/api/v1/auth/password', {
        currentPassword: 'not the password',
        newPassword: NEW_PASSWORD,
      })
      .expect(403);
    expect(res.body.code).toBe('CURRENT_PASSWORD_INCORRECT');
    expect(
      (await t.prisma.user.findUniqueOrThrow({ where: { id: me.user.id } }))
        .passwordHash,
    ).toBe(before.passwordHash);
    await me.get('/api/v1/auth/session').expect(200);
    expect(
      await t.prisma.auditLog.count({
        where: { action: 'auth.password_change_failed' },
      }),
    ).toBe(1);
  });

  it('enforces the password policy and rejects reusing the current password', async () => {
    const me = await t.signIn('EDITOR');
    for (const newPassword of ['short', ` ${NEW_PASSWORD}`, PASSWORD]) {
      const res = await me
        .post('/api/v1/auth/password', {
          currentPassword: PASSWORD,
          newPassword,
        })
        .expect(400);
      expect(res.body.code).toBe('VALIDATION_FAILED');
    }
    await login(me.user.email, PASSWORD).expect(200);
  });

  it('rate-limits wrong current passwords per user', async () => {
    const me = await t.signIn('EDITOR');
    const attempt = (currentPassword: string) =>
      me.post('/api/v1/auth/password', {
        currentPassword,
        newPassword: NEW_PASSWORD,
      });
    for (let i = 0; i < 5; i++) await attempt('wrong one').expect(403);
    const limited = await attempt(PASSWORD).expect(429);
    expect(limited.body.code).toBe('RATE_LIMITED');
    expect(Number(limited.headers['retry-after'])).toBeGreaterThan(0);
  });

  it('requires a session and the CSRF header', async () => {
    const body = { currentPassword: PASSWORD, newPassword: NEW_PASSWORD };
    await request(t.http).post('/api/v1/auth/password').send(body).expect(401);
    const me = await t.signIn('VIEWER');
    const noCsrf = await me.agent
      .post('/api/v1/auth/password')
      .send(body)
      .expect(403);
    expect(noCsrf.body.code).toBe('CSRF_TOKEN_INVALID');
    await login(me.user.email, PASSWORD).expect(200); // unchanged
  });
});

describe('Account security: restarts and rate-limit windows (PostgreSQL)', () => {
  it('a backend restart changes no credentials; live sessions survive, revoked ones stay dead', async () => {
    const first = await setupApp();
    await first.reset();
    const user = await first.createUser(['EDITOR']);
    const signIn = () =>
      request(first.http)
        .post('/api/v1/auth/login')
        .send({ email: user.email, password: PASSWORD })
        .expect(200);
    const cookieOf = (res: request.Response) =>
      (res.headers['set-cookie'] as unknown as string[])[0].split(';')[0];
    const live = cookieOf(await signIn());
    const revoked = cookieOf(await signIn());
    const { csrfToken } = (
      await request(first.http)
        .get('/api/v1/auth/session')
        .set('Cookie', revoked)
        .expect(200)
    ).body;
    await request(first.http)
      .post('/api/v1/auth/logout')
      .set('Cookie', revoked)
      .set('X-CSRF-Token', csrfToken)
      .expect(204);
    const before = await first.prisma.user.findUniqueOrThrow({
      where: { id: user.id },
    });
    await first.app.close();

    const second = await setupApp(); // a fresh process-equivalent: new Nest app, new limiters
    try {
      const after = await second.prisma.user.findUniqueOrThrow({
        where: { id: user.id },
      });
      expect(after.passwordHash).toBe(before.passwordHash);
      expect(after.updatedAt).toEqual(before.updatedAt);
      await request(second.http)
        .get('/api/v1/auth/session')
        .set('Cookie', live)
        .expect(200);
      await request(second.http)
        .get('/api/v1/auth/session')
        .set('Cookie', revoked)
        .expect(401);
      await request(second.http)
        .post('/api/v1/auth/login')
        .send({ email: user.email, password: PASSWORD })
        .expect(200);
    } finally {
      await second.app.close();
    }
  });

  it('after the 15-minute window a rate-limited account can sign in again', async () => {
    const t = await setupApp();
    try {
      await t.reset();
      const user = await t.createUser(['EDITOR']);
      const login = (password: string) =>
        request(t.http)
          .post('/api/v1/auth/login')
          .send({ email: user.email, password });
      vi.useFakeTimers({ toFake: ['Date'] }); // only the clock: I/O timers keep running
      for (let i = 0; i < 5; i++) await login('wrong').expect(401);
      await login(PASSWORD).expect(429);
      vi.setSystemTime(Date.now() + 15 * 60_000 + 1_000);
      await login(PASSWORD).expect(200);
    } finally {
      vi.useRealTimers();
      await t.app.close();
    }
  });
});
