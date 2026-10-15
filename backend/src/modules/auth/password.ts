// Self-contained (node:crypto only) so scripts/create-user.ts can import it without Nest.
import { randomBytes, scrypt, timingSafeEqual } from 'node:crypto';

// OWASP-listed scrypt equivalent of N=2^17,r=8,p=1 at a quarter of the memory (32 MiB per hash).
const N = 2 ** 15;
const R = 8;
const P = 3;
const KEY_LENGTH = 64;

function derive(
  password: string,
  salt: Buffer,
  n: number,
  r: number,
  p: number,
): Promise<Buffer> {
  return new Promise((resolve, reject) =>
    scrypt(
      password.normalize('NFKC'),
      salt,
      KEY_LENGTH,
      { N: n, r, p, maxmem: 2 * 128 * n * r },
      (err, key) => (err ? reject(err) : resolve(key)),
    ),
  );
}

/** Format: scrypt$N$r$p$salt$hash (base64url). Parameters are stored so they can be raised later. */
export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const key = await derive(password, salt, N, R, P);
  return [
    'scrypt',
    N,
    R,
    P,
    salt.toString('base64url'),
    key.toString('base64url'),
  ].join('$');
}

export async function verifyPassword(
  password: string,
  stored: string,
): Promise<boolean> {
  const [scheme, n, r, p, salt, hash] = stored.split('$');
  if (scheme !== 'scrypt' || !salt || !hash) return false;
  const expected = Buffer.from(hash, 'base64url');
  const key = await derive(
    password,
    Buffer.from(salt, 'base64url'),
    Number(n),
    Number(r),
    Number(p),
  );
  return key.length === expected.length && timingSafeEqual(key, expected);
}

/** Verified against when the email is unknown, so response time does not reveal which accounts exist. */
export const DUMMY_HASH = `scrypt$${N}$${R}$${P}$AAAAAAAAAAAAAAAAAAAAAA$${'A'.repeat(86)}`;
