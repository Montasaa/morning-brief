// Passwords: stored only as a salted scrypt hash, `scrypt$N$r$p$salt$hash`
// (salt and hash base64url), and compared in constant time. The parameters
// travel with each hash, so they can be raised later without breaking old ones.
import { randomBytes, scrypt, timingSafeEqual, type ScryptOptions } from "node:crypto";

export const MIN_PASSWORD_LENGTH = 8;
/** Generous, but stops a megabyte "password" from being hashed. */
export const MAX_PASSWORD_LENGTH = 200;

const R = 8;
const P = 1;
const KEY_LENGTH = 64;
const SALT_BYTES = 16;
/** The largest N accepted from a stored hash (2^20 needs 1 GiB at r=8). */
const MAX_N = 2 ** 20;

function derive(password: string, salt: Buffer, opts: { N: number; r: number; p: number }): Promise<Buffer> {
  const options: ScryptOptions = { ...opts, maxmem: 256 * opts.N * opts.r + 1024 * 1024 };
  return new Promise((resolve, reject) =>
    scrypt(password.normalize("NFC"), salt, KEY_LENGTH, options, (err, key) => (err ? reject(err) : resolve(key))),
  );
}

export type PasswordProblem = "too-short" | "too-long";

/** Why `password` cannot be used, or null if it can. Counted in characters, so Arabic passwords count right. */
export function passwordProblem(password: string): PasswordProblem | null {
  const length = [...password].length;
  if (length < MIN_PASSWORD_LENGTH) return "too-short";
  if (length > MAX_PASSWORD_LENGTH) return "too-long";
  return null;
}

/** A new salted hash of `password`, with scrypt cost `N` (the app's config.passwordCost). */
export async function hashPassword(password: string, N: number): Promise<string> {
  const salt = randomBytes(SALT_BYTES);
  const key = await derive(password, salt, { N, r: R, p: P });
  return ["scrypt", N, R, P, salt.toString("base64url"), key.toString("base64url")].join("$");
}

const dummies = new Map<number, Promise<string>>();

/**
 * Whether `password` matches `stored`. With no stored hash (an unknown email, or
 * a Reader with no password yet) it still hashes against a dummy, so the answer
 * takes as long as a real one and never tells who is a Reader.
 */
export async function verifyPassword(password: string, stored: string | null, N: number): Promise<boolean> {
  const parsed = stored ? parse(stored) : null;
  if (!parsed) {
    if (!dummies.has(N)) dummies.set(N, hashPassword(randomBytes(16).toString("hex"), N));
    const fake = parse(await dummies.get(N)!)!;
    const key = await derive(password.slice(0, MAX_PASSWORD_LENGTH * 4), fake.salt, fake);
    timingSafeEqual(key, fake.hash);
    return false;
  }
  if ([...password].length > MAX_PASSWORD_LENGTH) return false;
  const key = await derive(password, parsed.salt, parsed);
  return key.length === parsed.hash.length && timingSafeEqual(key, parsed.hash);
}

function parse(stored: string): { N: number; r: number; p: number; salt: Buffer; hash: Buffer } | null {
  const [kind, n, r, p, salt, hash] = stored.split("$");
  if (kind !== "scrypt" || !salt || !hash) return null;
  const [N, rr, pp] = [Number(n), Number(r), Number(p)];
  const powerOfTwo = Number.isInteger(N) && N > 1 && (N & (N - 1)) === 0;
  if (!powerOfTwo || N > MAX_N || !Number.isInteger(rr) || rr < 1 || rr > 32 || !Number.isInteger(pp) || pp < 1 || pp > 16) {
    return null;
  }
  const hashBytes = Buffer.from(hash, "base64url");
  if (hashBytes.length !== KEY_LENGTH) return null;
  return { N, r: rr, p: pp, salt: Buffer.from(salt, "base64url"), hash: hashBytes };
}
