// Pulls recent posts from the X accounts in X_ACCOUNTS into the tweets table.
// Runs from the cron trigger; the site only ever reads the cached copy, so page
// loads never spend X API quota.

import type { Env } from "./index.ts";

const API = "https://api.x.com/2";

// Heuristic flag for posts about online drops (vs. in-store sightings).
const ONLINE_RE = /\b(online|live now|in stock|restock(ed)?|drop(ping)?|pre-?order|link|\.com|pokemon ?center|target\.com|walmart\.com|amazon|best ?buy|gamestop)\b/i;

export function isOnlineDrop(text: string): boolean {
  return ONLINE_RE.test(text);
}

async function xGet<T>(env: Env, path: string): Promise<T> {
  const res = await fetch(API + path, { headers: { Authorization: `Bearer ${env.X_BEARER_TOKEN}` } });
  if (!res.ok) throw new Error(`X API ${res.status} on ${path}: ${await res.text()}`);
  return res.json() as Promise<T>;
}

async function kvGet(env: Env, k: string): Promise<string | null> {
  const row = await env.DB.prepare("SELECT v FROM kv WHERE k = ?").bind(k).first<{ v: string }>();
  return row?.v ?? null;
}

async function kvSet(env: Env, k: string, v: string): Promise<void> {
  await env.DB.prepare("INSERT INTO kv (k, v) VALUES (?, ?) ON CONFLICT(k) DO UPDATE SET v = excluded.v").bind(k, v).run();
}

async function userId(env: Env, handle: string): Promise<string> {
  const cached = await kvGet(env, `x_uid:${handle}`);
  if (cached) return cached;
  const { data } = await xGet<{ data: { id: string } }>(env, `/users/by/username/${encodeURIComponent(handle)}`);
  await kvSet(env, `x_uid:${handle}`, data.id);
  return data.id;
}

export async function pullXFeed(env: Env): Promise<void> {
  if (!env.X_BEARER_TOKEN) return;
  const handles = (env.X_ACCOUNTS ?? "").split(",").map((h) => h.trim().replace(/^@/, "")).filter(Boolean);

  for (const handle of handles) {
    try {
      const id = await userId(env, handle);
      const sinceId = await kvGet(env, `x_since:${handle}`);
      const qs = new URLSearchParams({
        max_results: "10",
        exclude: "retweets,replies",
        "tweet.fields": "created_at",
      });
      if (sinceId) qs.set("since_id", sinceId);
      const res = await xGet<{ data?: { id: string; text: string; created_at: string }[]; meta?: { newest_id?: string } }>(
        env,
        `/users/${id}/tweets?${qs}`,
      );
      const posts = res.data ?? [];
      if (posts.length) {
        await env.DB.batch(
          posts.map((p) =>
            env.DB.prepare(
              "INSERT OR IGNORE INTO tweets (id, handle, text, url, posted_at, is_online) VALUES (?, ?, ?, ?, ?, ?)",
            ).bind(p.id, handle, p.text, `https://x.com/${handle}/status/${p.id}`, p.created_at, isOnlineDrop(p.text) ? 1 : 0),
          ),
        );
      }
      if (res.meta?.newest_id) await kvSet(env, `x_since:${handle}`, res.meta.newest_id);
    } catch (err) {
      console.error(`X feed pull failed for @${handle}:`, err);
    }
  }

  // Keep the cache small: drop anything older than 30 days.
  await env.DB.prepare("DELETE FROM tweets WHERE posted_at < ?")
    .bind(new Date(Date.now() - 30 * 86400_000).toISOString())
    .run();
}
