// Site-wide shared-password gate. No accounts: the password is stored only as a
// PBKDF2 hash (SITE_PASSWORD_HASH secret) and a successful login gets an
// HMAC-signed cookie. Changing the password invalidates every session, because
// the hash is mixed into the cookie signature.

export const COOKIE_NAME = "pk_session";
const PBKDF2_ITERATIONS = 100_000; // Workers' WebCrypto caps PBKDF2 at 100k.

const enc = new TextEncoder();

function b64url(bytes: ArrayBuffer | Uint8Array): string {
  const arr = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  let s = "";
  for (const b of arr) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function fromB64url(s: string): Uint8Array {
  const bin = atob(s.replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from(bin, (c) => c.charCodeAt(0));
}

function constantTimeEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i];
  return diff === 0;
}

async function pbkdf2(password: string, salt: Uint8Array, iterations: number): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey("raw", enc.encode(password), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits({ name: "PBKDF2", hash: "SHA-256", salt, iterations }, key, 256);
  return new Uint8Array(bits);
}

/** Produces "pbkdf2-sha256$<iterations>$<salt>$<hash>" (base64url parts). */
export async function hashPassword(password: string): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const hash = await pbkdf2(password, salt, PBKDF2_ITERATIONS);
  return `pbkdf2-sha256$${PBKDF2_ITERATIONS}$${b64url(salt)}$${b64url(hash)}`;
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [scheme, iter, salt, hash] = stored.split("$");
  if (scheme !== "pbkdf2-sha256" || !iter || !salt || !hash) return false;
  const actual = await pbkdf2(password, fromB64url(salt), Number(iter));
  return constantTimeEqual(actual, fromB64url(hash));
}

async function hmac(secret: string, data: string): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey("raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return new Uint8Array(await crypto.subtle.sign("HMAC", key, enc.encode(data)));
}

/** Cookie value: "<expiryUnixSeconds>.<signature>". */
export async function createSession(secret: string, passwordHash: string, days: number, now = Date.now()): Promise<string> {
  const exp = Math.floor(now / 1000) + days * 86400;
  const sig = await hmac(secret, `${exp}|${passwordHash}`);
  return `${exp}.${b64url(sig)}`;
}

export async function verifySession(value: string | undefined, secret: string, passwordHash: string, now = Date.now()): Promise<boolean> {
  if (!value) return false;
  const [expStr, sig] = value.split(".");
  const exp = Number(expStr);
  if (!Number.isInteger(exp) || !sig || exp < now / 1000) return false;
  const expected = await hmac(secret, `${exp}|${passwordHash}`);
  try {
    return constantTimeEqual(expected, fromB64url(sig));
  } catch {
    return false; // malformed base64
  }
}

export function readCookie(req: Request, name: string): string | undefined {
  const header = req.headers.get("Cookie") ?? "";
  for (const part of header.split(";")) {
    const [k, ...v] = part.trim().split("=");
    if (k === name) return v.join("=");
  }
  return undefined;
}

export function sessionCookie(value: string, days: number): string {
  return `${COOKIE_NAME}=${value}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${days * 86400}`;
}

export const clearCookie = `${COOKIE_NAME}=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0`;
