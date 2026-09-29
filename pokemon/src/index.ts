// Worker entry: password gate in front of everything and a small JSON API over D1.

import {
  COOKIE_NAME,
  clearCookie,
  createSession,
  readCookie,
  sessionCookie,
  verifyPassword,
  verifySession,
} from "./auth.ts";
import { geocodeUS } from "./geocode.ts";

export interface Env {
  DB: D1Database;
  ASSETS: Fetcher;
  SITE_PASSWORD_HASH: string;
  SESSION_SECRET: string;
  SESSION_DAYS?: string;
}

// Paths reachable without logging in.
const PUBLIC_PATHS = new Set(["/robots.txt", "/login", "/login.html", "/login.js", "/favicon.ico", "/styles.css"]);

// Login throttle: this many failures per IP within the window locks that IP out.
const MAX_FAILURES = 10;
const FAILURE_WINDOW_S = 15 * 60;

const SECURITY_HEADERS: Record<string, string> = {
  "X-Robots-Tag": "noindex, nofollow, noarchive",
  "X-Content-Type-Options": "nosniff",
  "Referrer-Policy": "no-referrer",
  "X-Frame-Options": "DENY",
  "Content-Security-Policy":
    "default-src 'self'; img-src 'self' data: https://*.tile.openstreetmap.org; " +
    "style-src 'self' 'unsafe-inline'; script-src 'self'; connect-src 'self'; frame-ancestors 'none'",
};

class HttpError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

function withHeaders(res: Response, extra: Record<string, string> = {}): Response {
  const out = new Response(res.body, res);
  for (const [k, v] of Object.entries({ ...SECURITY_HEADERS, ...extra })) out.headers.set(k, v);
  return out;
}

function json(data: unknown, status = 200, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store", ...headers },
  });
}

async function body(req: Request): Promise<Record<string, unknown>> {
  // Requiring a JSON content type blocks cross-site form posts (CSRF) without a token.
  if (!req.headers.get("Content-Type")?.includes("application/json")) {
    throw new HttpError(415, "Expected application/json");
  }
  try {
    const data = await req.json();
    if (data && typeof data === "object" && !Array.isArray(data)) return data as Record<string, unknown>;
  } catch {}
  throw new HttpError(400, "Invalid JSON body");
}

function str(v: unknown, field: string, { required = false, max = 2000 } = {}): string {
  const s = typeof v === "string" ? v.trim() : v == null ? "" : String(v).trim();
  if (required && !s) throw new HttpError(400, `${field} is required`);
  if (s.length > max) throw new HttpError(400, `${field} is too long (max ${max})`);
  return s;
}

function num(v: unknown, field: string, min: number, max: number): number {
  const n = Number(v);
  if (!Number.isFinite(n) || n < min || n > max) throw new HttpError(400, `${field} is invalid`);
  return n;
}

function isoDate(v: unknown, field: string, fallback?: string): string {
  if ((v == null || v === "") && fallback) return fallback;
  const d = new Date(String(v));
  if (Number.isNaN(d.getTime())) throw new HttpError(400, `${field} must be a date`);
  return d.toISOString();
}

function url(v: unknown, field: string): string {
  const s = str(v, field, { max: 500 });
  if (s && !/^https?:\/\//i.test(s)) throw new HttpError(400, `${field} must start with http(s)://`);
  return s;
}

// ---------------------------------------------------------------------------
// Auth routes

async function login(req: Request, env: Env): Promise<Response> {
  const ip = req.headers.get("CF-Connecting-IP") ?? "unknown";
  const now = Math.floor(Date.now() / 1000);
  await env.DB.prepare("DELETE FROM login_failures WHERE at < ?").bind(now - FAILURE_WINDOW_S).run();
  const { n } = (await env.DB.prepare("SELECT COUNT(*) AS n FROM login_failures WHERE ip = ?").bind(ip).first<{ n: number }>())!;
  if (n >= MAX_FAILURES) return Response.redirect(new URL("/login?error=locked", req.url).toString(), 303);

  const form = await req.formData();
  const password = String(form.get("password") ?? "");
  if (!env.SITE_PASSWORD_HASH || !(await verifyPassword(password, env.SITE_PASSWORD_HASH))) {
    await env.DB.prepare("INSERT INTO login_failures (ip, at) VALUES (?, ?)").bind(ip, now).run();
    return Response.redirect(new URL("/login?error=1", req.url).toString(), 303);
  }

  const days = Number(env.SESSION_DAYS ?? 30);
  const session = await createSession(env.SESSION_SECRET, env.SITE_PASSWORD_HASH, days);
  return new Response(null, { status: 303, headers: { Location: "/", "Set-Cookie": sessionCookie(session, days) } });
}

// ---------------------------------------------------------------------------
// API

// Each store comes back with its most recent confirmed visit and most recent
// in-stock sighting, which is what the map popups and list rows lead with.
const STORE_SELECT = `
  SELECT s.*,
    lv.visited_at AS last_visit_at, lv.in_stock AS last_visit_in_stock,
    lv.products AS last_visit_products, lv.visitor AS last_visit_by,
    ls.visited_at AS last_stock_at, ls.products AS last_stock_products,
    (SELECT COUNT(*) FROM visits v WHERE v.store_id = s.id) AS visit_count
  FROM stores s
  LEFT JOIN visits lv ON lv.id = (
    SELECT id FROM visits WHERE store_id = s.id AND confirmed = 1 ORDER BY visited_at DESC LIMIT 1)
  LEFT JOIN visits ls ON ls.id = (
    SELECT id FROM visits WHERE store_id = s.id AND confirmed = 1 AND in_stock = 1 ORDER BY visited_at DESC LIMIT 1)`;

function storeFields(b: Record<string, unknown>) {
  return {
    name: str(b.name, "name", { required: true, max: 120 }),
    chain: str(b.chain, "chain", { max: 60 }),
    address: str(b.address, "address", { required: true, max: 300 }),
    restock_notes: str(b.restock_notes, "restock_notes"),
  };
}

async function api(req: Request, env: Env, path: string): Promise<Response> {
  const m = req.method;
  let match: RegExpMatchArray | null;

  if (path === "/api/stores" && m === "GET") {
    const { results } = await env.DB.prepare(`${STORE_SELECT} ORDER BY s.name`).all();
    return json(results);
  }

  if (path === "/api/stores" && m === "POST") {
    const b = await body(req);
    const f = storeFields(b);
    let lat: number, lng: number;
    if (b.lat != null && b.lng != null) {
      lat = num(b.lat, "lat", -90, 90);
      lng = num(b.lng, "lng", -180, 180);
    } else {
      const geo = await geocodeUS(f.address);
      if (!geo) throw new HttpError(422, "Couldn't find that address. Drop a pin on the map instead.");
      ({ lat, lng } = geo);
    }
    const row = await env.DB.prepare(
      "INSERT INTO stores (name, chain, address, lat, lng, restock_notes) VALUES (?, ?, ?, ?, ?, ?) RETURNING id",
    ).bind(f.name, f.chain, f.address, lat, lng, f.restock_notes).first<{ id: number }>();
    return json(await env.DB.prepare(`${STORE_SELECT} WHERE s.id = ?`).bind(row!.id).first(), 201);
  }

  if ((match = path.match(/^\/api\/stores\/(\d+)$/))) {
    const id = Number(match[1]);
    if (m === "PATCH") {
      const b = await body(req);
      const f = storeFields(b);
      const lat = num(b.lat, "lat", -90, 90);
      const lng = num(b.lng, "lng", -180, 180);
      const res = await env.DB.prepare(
        `UPDATE stores SET name = ?, chain = ?, address = ?, lat = ?, lng = ?, restock_notes = ?,
           updated_at = strftime('%Y-%m-%dT%H:%M:%SZ', 'now') WHERE id = ?`,
      ).bind(f.name, f.chain, f.address, lat, lng, f.restock_notes, id).run();
      if (!res.meta.changes) throw new HttpError(404, "Store not found");
      return json(await env.DB.prepare(`${STORE_SELECT} WHERE s.id = ?`).bind(id).first());
    }
    if (m === "DELETE") {
      await env.DB.batch([
        env.DB.prepare("DELETE FROM visits WHERE store_id = ?").bind(id),
        env.DB.prepare("DELETE FROM stores WHERE id = ?").bind(id),
      ]);
      return json({ ok: true });
    }
  }

  if ((match = path.match(/^\/api\/stores\/(\d+)\/visits$/))) {
    const storeId = Number(match[1]);
    if (m === "GET") {
      const { results } = await env.DB.prepare(
        "SELECT * FROM visits WHERE store_id = ? ORDER BY visited_at DESC LIMIT 50",
      ).bind(storeId).all();
      return json(results);
    }
    if (m === "POST") {
      const b = await body(req);
      const exists = await env.DB.prepare("SELECT 1 FROM stores WHERE id = ?").bind(storeId).first();
      if (!exists) throw new HttpError(404, "Store not found");
      const visitedAt = isoDate(b.visited_at, "visited_at", new Date().toISOString());
      if (Date.parse(visitedAt) > Date.now() + 5 * 60_000) throw new HttpError(400, "visited_at is in the future");
      const row = await env.DB.prepare(
        `INSERT INTO visits (store_id, visited_at, confirmed, in_stock, products, notes, visitor)
         VALUES (?, ?, ?, ?, ?, ?, ?) RETURNING *`,
      ).bind(
        storeId,
        visitedAt,
        b.confirmed === false ? 0 : 1,
        b.in_stock ? 1 : 0,
        str(b.products, "products", { max: 500 }),
        str(b.notes, "notes", { max: 1000 }),
        str(b.visitor, "visitor", { max: 40 }),
      ).first();
      return json(row, 201);
    }
  }

  if ((match = path.match(/^\/api\/visits\/(\d+)$/)) && m === "DELETE") {
    await env.DB.prepare("DELETE FROM visits WHERE id = ?").bind(Number(match[1])).run();
    return json({ ok: true });
  }

  if (path === "/api/events" && m === "GET") {
    // Keep events visible for a couple of hours after they start: drops run long.
    const since = new Date(Date.now() - 2 * 3600_000).toISOString();
    const { results } = await env.DB.prepare("SELECT * FROM events WHERE starts_at >= ? ORDER BY starts_at").bind(since).all();
    return json(results);
  }

  if (path === "/api/events" && m === "POST") {
    const b = await body(req);
    const row = await env.DB.prepare(
      "INSERT INTO events (title, retailer, starts_at, url, notes) VALUES (?, ?, ?, ?, ?) RETURNING *",
    ).bind(
      str(b.title, "title", { required: true, max: 200 }),
      str(b.retailer, "retailer", { max: 80 }),
      isoDate(b.starts_at, "starts_at"),
      url(b.url, "url"),
      str(b.notes, "notes", { max: 1000 }),
    ).first();
    return json(row, 201);
  }

  if ((match = path.match(/^\/api\/events\/(\d+)$/)) && m === "DELETE") {
    await env.DB.prepare("DELETE FROM events WHERE id = ?").bind(Number(match[1])).run();
    return json({ ok: true });
  }

  if (path === "/api/geocode" && m === "GET") {
    const q = str(new URL(req.url).searchParams.get("q"), "q", { required: true, max: 300 });
    const geo = await geocodeUS(q);
    if (!geo) throw new HttpError(404, "Address not found");
    return json(geo);
  }

  throw new HttpError(404, "Not found");
}

// ---------------------------------------------------------------------------

async function handle(req: Request, env: Env): Promise<Response> {
  const { pathname } = new URL(req.url);

  if (pathname === "/api/login" && req.method === "POST") return login(req, env);
  if (pathname === "/api/logout" && req.method === "POST") {
    return new Response(null, { status: 303, headers: { Location: "/login", "Set-Cookie": clearCookie } });
  }
  if (PUBLIC_PATHS.has(pathname)) return env.ASSETS.fetch(req);

  const authed = await verifySession(readCookie(req, COOKIE_NAME), env.SESSION_SECRET, env.SITE_PASSWORD_HASH);
  if (!authed) {
    if (pathname.startsWith("/api/")) return json({ error: "Login required" }, 401);
    return Response.redirect(new URL("/login", req.url).toString(), 302);
  }

  if (pathname.startsWith("/api/")) {
    try {
      return await api(req, env, pathname);
    } catch (err) {
      if (err instanceof HttpError) return json({ error: err.message }, err.status);
      console.error(err);
      return json({ error: "Server error" }, 500);
    }
  }

  const res = await env.ASSETS.fetch(req);
  // Private pages must never sit in a shared cache.
  return withHeaders(res, { "Cache-Control": "private, no-cache" });
}

export default {
  async fetch(req, env): Promise<Response> {
    return withHeaders(await handle(req, env));
  },
} satisfies ExportedHandler<Env>;
