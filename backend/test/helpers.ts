import type { NestExpressApplication } from '@nestjs/platform-express';
import { Test, type TestingModuleBuilder } from '@nestjs/testing';
import { readFileSync } from 'node:fs';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { configureApp } from '../src/app.setup';
import { PrismaService } from '../src/infrastructure/database/prisma.service';
import { hashPassword } from '../src/modules/auth/password';
import { resetTestData } from '../src/scripts/reset-test-data';

export const PASSWORD = 'correct horse battery staple';
let passwordHash: Promise<string> | undefined;
let userSeq = 0;

export type TestApp = Awaited<ReturnType<typeof setupApp>>;
export type Session = Awaited<ReturnType<TestApp['signIn']>>;

/** `configure` can override providers, e.g. replace the inquiry email notifier with a recorder. */
export async function setupApp(
  configure: (builder: TestingModuleBuilder) => TestingModuleBuilder = (b) => b,
) {
  const moduleRef = await configure(
    Test.createTestingModule({ imports: [AppModule] }),
  ).compile();
  const app = moduleRef.createNestApplication<NestExpressApplication>({
    bodyParser: false,
    logger: ['error'],
  });
  configureApp(app);
  await app.init();
  const prisma = app.get(PrismaService);
  const http = app.getHttpServer();

  const createUser = async (
    roles: string[],
    data: { isActive?: boolean } = {},
  ) => {
    passwordHash ??= hashPassword(PASSWORD);
    userSeq++;
    return prisma.user.create({
      data: {
        email: `user${userSeq}.${Date.now()}@hmv.test`,
        displayName: `Test User ${userSeq}`,
        passwordHash: await passwordHash,
        roles: { create: roles.map((roleCode) => ({ roleCode })) },
        ...data,
      },
    });
  };

  /** Signs in a fresh user with the given roles. Write helpers send the CSRF header automatically. */
  const signIn = async (...roles: string[]) => {
    const user = await createUser(roles);
    const agent = request.agent(http);
    const res = await agent
      .post('/api/v1/auth/login')
      .send({ email: user.email, password: PASSWORD })
      .expect(200);
    const csrf: string = res.body.csrfToken;
    return {
      user,
      agent,
      csrf,
      get: (url: string) => agent.get(url),
      post: (url: string, body?: object) =>
        agent.post(url).set('X-CSRF-Token', csrf).send(body),
      patch: (url: string, body?: object) =>
        agent.patch(url).set('X-CSRF-Token', csrf).send(body),
      upload: (url: string) => agent.post(url).set('X-CSRF-Token', csrf),
    };
  };

  /** Deletes everything except reference data (locales, roles, permissions, categories). */
  const reset = () => resetTestData(prisma);

  return { app, prisma, http, createUser, signIn, reset };
}

// ---------- Response contract check against the generated OpenAPI document ----------

interface Schema {
  $ref?: string;
  allOf?: Schema[];
  type?: string;
  properties?: Record<string, Schema>;
  required?: string[];
  items?: Schema;
  nullable?: boolean;
  enum?: unknown[];
}

let spec: { components: { schemas: Record<string, Schema> } } | undefined;

function deref(schema: Schema): Schema {
  spec ??= JSON.parse(readFileSync(process.env.OPENAPI_SPEC_PATH!, 'utf8'));
  let s = schema;
  let nullable = Boolean(s.nullable);
  while (s.$ref || s.allOf?.length === 1) {
    s = s.$ref
      ? spec!.components.schemas[s.$ref.split('/').pop()!]
      : s.allOf![0];
    nullable ||= Boolean(s.nullable);
  }
  return { ...s, nullable };
}

function check(
  value: unknown,
  schema: Schema,
  path: string,
  problems: string[],
) {
  const s = deref(schema);
  if (value === null || value === undefined) {
    if (!s.nullable)
      problems.push(`${path}: ${value} but schema is not nullable`);
    return;
  }
  if (s.enum && !s.enum.includes(value))
    problems.push(`${path}: ${JSON.stringify(value)} not in enum`);
  const actual = Array.isArray(value) ? 'array' : typeof value;
  const expected = s.type === 'integer' ? 'number' : s.type;
  if (expected && actual !== expected)
    return void problems.push(`${path}: expected ${s.type}, got ${actual}`);
  if (s.type === 'array')
    (value as unknown[]).forEach((v, i) =>
      check(v, s.items!, `${path}[${i}]`, problems),
    );
  if (s.type === 'object' && s.properties) {
    const obj = value as Record<string, unknown>;
    for (const key of s.required ?? [])
      if (!(key in obj)) problems.push(`${path}.${key}: missing`);
    for (const [key, v] of Object.entries(obj)) {
      if (!s.properties[key])
        problems.push(`${path}.${key}: not in the OpenAPI schema`);
      else check(v, s.properties[key], `${path}.${key}`, problems);
    }
  }
}

/** Fails if `body` has undocumented fields, misses required ones, or has wrong primitive types. */
export function expectContract(body: unknown, schemaName: string) {
  const problems: string[] = [];
  check(
    body,
    { $ref: `#/components/schemas/${schemaName}` },
    schemaName,
    problems,
  );
  expect(problems).toEqual([]);
}
