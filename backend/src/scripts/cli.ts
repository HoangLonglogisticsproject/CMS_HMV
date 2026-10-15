// Shared plumbing for the user CLIs (create-user, reset-password, list-users). Self-contained: no Nest.
import { existsSync } from 'node:fs';
import { createInterface } from 'node:readline/promises';
import { passwordProblem } from '../modules/auth/password';

/** Loads backend/.env like Prisma would, without overriding variables that are already set. */
export function loadEnv() {
  if (!process.env.DATABASE_URL && existsSync('.env'))
    process.loadEnvFile('.env');
  if (!process.env.DATABASE_URL)
    fail('DATABASE_URL is not set (environment or backend/.env)');
}

/** "localhost:5442/hmv_cms (NODE_ENV=development)": what a command is about to change, without credentials. */
export function describeTarget(url = process.env.DATABASE_URL ?? '') {
  const u = new URL(url);
  return `${u.hostname}:${u.port || 5432}${u.pathname} (NODE_ENV=${process.env.NODE_ENV ?? 'development'})`;
}

export function fail(message: string): never {
  console.error(message);
  process.exit(1);
}

/** Reads one line from the terminal without echoing it. */
async function readHidden(question: string): Promise<string> {
  const stdin = process.stdin;
  process.stdout.write(question);
  stdin.setRawMode(true);
  stdin.resume();
  stdin.setEncoding('utf8');
  let value = '';
  try {
    for await (const chunk of stdin as AsyncIterable<string>) {
      for (const ch of chunk) {
        if (ch === '\r' || ch === '\n') return value;
        if (ch === '\u0003') fail('\nCancelled'); // Ctrl+C
        if (ch === '\u007f' || ch === '\b') value = value.slice(0, -1);
        else value += ch;
      }
    }
    return value;
  } finally {
    stdin.setRawMode(false);
    stdin.pause();
    process.stdout.write('\n');
  }
}

/** First line of piped stdin (automation). */
async function readStdinLine(): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin) chunks.push(chunk as Buffer);
  return Buffer.concat(chunks).toString('utf8').split(/\r?\n/)[0] ?? '';
}

/**
 * The new password, never from argv (shell history, process lists): HMV_USER_PASSWORD, else a hidden prompt (typed
 * twice) on a terminal, else the first line of stdin. Validated against the shared password policy.
 */
export async function readNewPassword(): Promise<string> {
  let password = process.env.HMV_USER_PASSWORD;
  if (!password && process.stdin.isTTY) {
    password = await readHidden('New password (input hidden): ');
    if ((await readHidden('Repeat the password: ')) !== password)
      fail('Passwords do not match; nothing changed.');
  } else if (!password) {
    password = await readStdinLine();
  }
  const problem = passwordProblem(password);
  if (problem) fail(`${problem}; nothing changed.`);
  return password!;
}

/** Interactive y/N on a terminal; non-interactive runs must pass --yes explicitly. */
export async function confirm(
  question: string,
  yes: boolean | undefined,
): Promise<void> {
  if (yes) return;
  if (!process.stdin.isTTY)
    fail(
      'Refusing to continue without confirmation: pass --yes when not running in a terminal.',
    );
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  const answer = await rl.question(`${question} [y/N] `);
  rl.close();
  if (answer.trim().toLowerCase() !== 'y') fail('Cancelled; nothing changed.');
}

export const normalizeEmail = (email: string) => email.trim().toLowerCase();
// Same shape check as class-validator's IsEmail is overkill here; the API validates strictly on login.
export const looksLikeEmail = (email: string) =>
  /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) && email.length <= 254;
