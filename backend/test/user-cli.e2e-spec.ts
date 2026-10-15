import { execFile, spawnSync } from 'node:child_process';
import { promisify } from 'node:util';
import request from 'supertest';
import { PASSWORD, setupApp, type TestApp } from './helpers';

// The CLIs run as real child processes against the test database (DATABASE_URL is set by vitest.config.e2e.ts).
const NEW_PASSWORD = 'a brand new passphrase 42';
const env = (password?: string) => ({
  ...process.env,
  HMV_USER_PASSWORD: password ?? '',
});
const cli = (
  script: string,
  args: string[],
  opts: { password?: string; input?: string } = {},
) => {
  const r = spawnSync(
    process.execPath,
    [`dist/scripts/${script}.js`, ...args],
    {
      env: env(opts.password),
      input: opts.input ?? '',
      encoding: 'utf8',
    },
  );
  return { code: r.status, out: `${r.stdout}${r.stderr}` };
};
const execFileAsync = promisify(execFile);

describe('User CLIs (PostgreSQL)', () => {
  let t: TestApp;
  const login = (email: string, password: string) =>
    request(t.http).post('/api/v1/auth/login').send({ email, password });

  beforeAll(async () => {
    t = await setupApp();
  });
  beforeEach(() => t.reset());
  afterAll(() => t.app.close());

  it('user:create creates a new account, audits it, shows the target and never echoes the password', async () => {
    const r = cli(
      'create-user',
      [
        '--email',
        'New.Editor@HMV.test',
        '--name',
        'Biên tập',
        '--role',
        'EDITOR',
      ],
      {
        password: NEW_PASSWORD,
      },
    );
    expect(r.code).toBe(0);
    expect(r.out).toContain('Target database: localhost:5442/hmv_cms_test');
    expect(r.out).not.toContain(NEW_PASSWORD);
    const user = await t.prisma.user.findUniqueOrThrow({
      where: { email: 'new.editor@hmv.test' },
      include: { roles: true },
    });
    expect(user.roles.map((x) => x.roleCode)).toEqual(['EDITOR']);
    const audit = await t.prisma.auditLog.findFirstOrThrow({
      where: { action: 'user.create', entityId: user.id },
    });
    expect(audit.metadata).toEqual({
      email: 'new.editor@hmv.test',
      roles: ['EDITOR'],
      via: 'cli',
    });
    await login('new.editor@hmv.test', NEW_PASSWORD).expect(200);
  });

  it('user:create refuses an existing email: password, roles, name and sessions are untouched', async () => {
    const admin = await t.signIn('ADMIN');
    const before = await t.prisma.user.findUniqueOrThrow({
      where: { id: admin.user.id },
      include: { roles: true },
    });

    const r = cli(
      'create-user',
      [
        '--email',
        admin.user.email,
        '--name',
        'Overwritten',
        '--role',
        'VIEWER',
      ],
      {
        password: NEW_PASSWORD,
      },
    );
    expect(r.code).toBe(1);
    expect(r.out).toContain('already exists; nothing changed');

    const after = await t.prisma.user.findUniqueOrThrow({
      where: { id: admin.user.id },
      include: { roles: true },
    });
    expect(after).toEqual(before);
    await admin.get('/api/v1/auth/session').expect(200); // not signed out
    await login(admin.user.email, PASSWORD).expect(200);
    expect(
      await t.prisma.auditLog.count({
        where: { action: { startsWith: 'user.' } },
      }),
    ).toBe(0);
  });

  it('concurrent user:create runs for one email produce exactly one account', async () => {
    const args = [
      'dist/scripts/create-user.js',
      '--email',
      'race@hmv.test',
      '--name',
      'Race',
      '--role',
      'EDITOR',
    ];
    const runs = await Promise.allSettled(
      Array.from({ length: 4 }, () =>
        execFileAsync(process.execPath, args, { env: env(NEW_PASSWORD) }),
      ),
    );
    expect(runs.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    expect(
      await t.prisma.user.count({ where: { email: 'race@hmv.test' } }),
    ).toBe(1);
  });

  it('user:create rejects weak passwords, unknown roles and invalid emails without writing anything', async () => {
    const base = ['--name', 'X', '--role', 'EDITOR'];
    expect(
      cli('create-user', ['--email', 'weak@hmv.test', ...base], {
        password: 'short',
      }).out,
    ).toContain('at least 12 characters');
    expect(
      cli('create-user', ['--email', 'pad@hmv.test', ...base], {
        password: ` ${NEW_PASSWORD}`,
      }).out,
    ).toContain('whitespace');
    expect(
      cli(
        'create-user',
        ['--email', 'role@hmv.test', '--name', 'X', '--role', 'GOD'],
        { password: NEW_PASSWORD },
      ).out,
    ).toContain('Unknown role(s): GOD');
    expect(
      cli('create-user', ['--email', 'not-an-email', ...base], {
        password: NEW_PASSWORD,
      }).code,
    ).toBe(1);
    expect(await t.prisma.user.count()).toBe(0);
  });

  it('reads the password from stdin when HMV_USER_PASSWORD is unset (automation)', async () => {
    const r = cli(
      'create-user',
      ['--email', 'stdin@hmv.test', '--name', 'S', '--role', 'VIEWER'],
      {
        input: `${NEW_PASSWORD}\n`,
      },
    );
    expect(r.code).toBe(0);
    await login('stdin@hmv.test', NEW_PASSWORD).expect(200);
  });

  it('user:reset-password changes only the target password and revokes only its sessions', async () => {
    const target = await t.signIn('REVIEWER');
    const other = await t.signIn('ADMIN');
    const otherBefore = await t.prisma.user.findUniqueOrThrow({
      where: { id: other.user.id },
    });

    const r = cli('reset-password', ['--email', target.user.email, '--yes'], {
      password: NEW_PASSWORD,
    });
    expect(r.code).toBe(0);
    expect(r.out).toContain('1 session(s) revoked');
    expect(r.out).not.toContain(NEW_PASSWORD);

    await target.get('/api/v1/auth/session').expect(401); // signed out everywhere
    await login(target.user.email, PASSWORD).expect(401);
    await login(target.user.email, NEW_PASSWORD).expect(200);
    const after = await t.prisma.user.findUniqueOrThrow({
      where: { id: target.user.id },
      include: { roles: true },
    });
    expect(after.roles.map((x) => x.roleCode)).toEqual(['REVIEWER']);
    expect(after.isActive).toBe(true);

    await other.get('/api/v1/auth/session').expect(200); // nobody else is touched
    expect(
      await t.prisma.user.findUniqueOrThrow({ where: { id: other.user.id } }),
    ).toEqual(otherBefore);
    const audit = await t.prisma.auditLog.findFirstOrThrow({
      where: { action: 'user.password_reset' },
    });
    expect(audit).toMatchObject({
      entityId: target.user.id,
      metadata: { via: 'cli', sessionsRevoked: 1 },
    });
  });

  it('user:reset-password refuses without confirmation when not interactive, and for unknown emails', async () => {
    const target = await t.createUser(['EDITOR']);
    const noConfirm = cli('reset-password', ['--email', target.email], {
      password: NEW_PASSWORD,
    });
    expect(noConfirm.code).toBe(1);
    expect(noConfirm.out).toContain('pass --yes');
    await login(target.email, PASSWORD).expect(200); // unchanged

    const unknown = cli(
      'reset-password',
      ['--email', 'ghost@hmv.test', '--yes'],
      { password: NEW_PASSWORD },
    );
    expect(unknown.code).toBe(1);
    expect(unknown.out).toContain('No user ghost@hmv.test; nothing changed');
    expect(
      await t.prisma.user.count({ where: { email: 'ghost@hmv.test' } }),
    ).toBe(0);
  });

  it('user:list shows accounts and sessions without hashes', async () => {
    const editor = await t.signIn('EDITOR');
    const r = cli('list-users', []);
    expect(r.code).toBe(0);
    expect(r.out).toContain(editor.user.email);
    expect(r.out).not.toContain('scrypt$');
  });
});
