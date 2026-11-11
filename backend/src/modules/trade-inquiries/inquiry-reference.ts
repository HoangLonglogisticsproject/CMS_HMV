import { randomInt } from 'node:crypto';

// Public inquiry reference, shown to the buyer and quoted in follow-ups: HMV-<year>-<6 characters>. Cryptographically
// random, without 0/O and 1/I. The unique column is authoritative: the service retries on the (unlikely) collision.
const ALPHABET = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';
export const REFERENCE = /^HMV-\d{4}-[23456789ABCDEFGHJKLMNPQRSTUVWXYZ]{6}$/;

export const createReference = (
  date = new Date(),
  rand: (max: number) => number = randomInt,
) =>
  `HMV-${date.getUTCFullYear()}-${Array.from({ length: 6 }, () => ALPHABET[rand(ALPHABET.length)]).join('')}`;
