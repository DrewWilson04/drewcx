// Site-wide shared-password gate. No accounts: one hardcoded password, and a
// successful login gets a cookie signed with that password. Changing
// SITE_PASSWORD logs everyone out.

export const SITE_PASSWORD = "KHFan";
export const COOKIE_NAME = "pk_session";

const enc = new TextEncoder();

function b64url(bytes: Uint8Array): string {
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function constantTimeEqual(a: string, b: string): boolean {
  const x = enc.encode(a), y = enc.encode(b);
  if (x.length !== y.length) return false;
  let diff = 0;
  for (let i = 0; i < x.length; i++) diff |= x[i] ^ y[i];
  return diff === 0;
}

export function checkPassword(input: string, password = SITE_PASSWORD): boolean {
  return constantTimeEqual(input, password);
}

async function sign(key: string, data: string): Promise<string> {
  const k = await crypto.subtle.importKey("raw", enc.encode(key), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return b64url(new Uint8Array(await crypto.subtle.sign("HMAC", k, enc.encode(data))));
}

/** Cookie value: "<expiryUnixSeconds>.<signature>". */
export async function createSession(days: number, now = Date.now(), password = SITE_PASSWORD): Promise<string> {
  const exp = Math.floor(now / 1000) + days * 86400;
  return `${exp}.${await sign(password, String(exp))}`;
}

export async function verifySession(value: string | undefined, now = Date.now(), password = SITE_PASSWORD): Promise<boolean> {
  if (!value) return false;
  const [expStr, sig] = value.split(".");
  const exp = Number(expStr);
  if (!Number.isInteger(exp) || !sig || exp < now / 1000) return false;
  return constantTimeEqual(sig, await sign(password, expStr));
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
