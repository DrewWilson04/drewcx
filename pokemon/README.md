# Pokemon Restock Tracker (pokemon.drew.cx)

A private map of local stores where the group logs Pokemon card restocks. It also shows a feed of restock alerts from a few X accounts. The whole site sits behind one shared password.

## Stack

| Piece | Choice | Why |
|---|---|---|
| Hosting + backend | **One Cloudflare Worker** with static assets | A single deploy serves both the static files and the small API. It fits in the free tier and there's no server to patch. |
| Database | **Cloudflare D1** (SQLite) | Stores, visits, events and cached tweets. Also free tier. |
| Frontend | **Plain HTML/CSS/JS modules**, no build step | Nothing to upgrade and nothing to compile. |
| Map | **Leaflet** (vendored in `public/vendor/`) + OpenStreetMap tiles | Free, and no API key. |
| Geocoding | **US Census geocoder** | Free, no key, USA only. If an address doesn't match, you tap the map to place the pin. |
| X feed | **X API v2**, pulled by a cron trigger every 15 min and cached in D1 | Page loads never call X, so API spend stays small and predictable. |
| Auth | Shared password → PBKDF2 hash in a secret → HMAC-signed cookie | No accounts and no stored credentials. Changing the password logs everyone out. |

### How the password gate works

`run_worker_first = true` sends every request through `src/index.ts` before any file is served, including HTML, JS and CSS. Only these paths skip the gate: `/robots.txt`, `/login`, `/login.js`, `/styles.css` and `/favicon.ico`. Failed logins are throttled to 10 per IP per 15 minutes.

### Keeping crawlers out

- `robots.txt` disallows everything.
- Every page has `<meta name="robots" content="noindex, nofollow">`.
- Every response carries an `X-Robots-Tag: noindex, nofollow, noarchive` header.
- Everything except the login page needs a login anyway.

## Layout

```
pokemon/
├── wrangler.toml            Worker config: assets, D1 binding, cron, vars
├── migrations/0001_init.sql D1 schema (stores, visits, tweets, events, kv, login_failures)
├── scripts/hash-password.mjs  Prints the SITE_PASSWORD_HASH value for a password
├── src/
│   ├── index.ts             Router: password gate, JSON API, cron entry
│   ├── auth.ts              PBKDF2 password check + signed session cookie
│   ├── geocode.ts           US Census geocoder
│   ├── x.ts                 X API puller (cron)
│   └── *.test.ts            node:test unit tests
└── public/                  Static site (served only after login)
    ├── index.html           App shell: map / list / feed views, hamburger drawer, dialogs
    ├── login.html, login.js Password page
    ├── robots.txt
    ├── styles.css
    ├── js/
    │   ├── app.js           State, filters, drawer, dialogs, wiring
    │   ├── map.js           Leaflet map, pins and popups
    │   ├── list.js          Sortable store list
    │   ├── feed.js          Tweets and upcoming online restocks
    │   ├── api.js, util.js
    └── vendor/leaflet/      Leaflet 1.9.4
```

## API

All routes need the session cookie. Writes must send `Content-Type: application/json`, which blocks cross-site form posts (CSRF).

| Method | Path | |
|---|---|---|
| POST | `/api/login` | form field `password` |
| POST | `/api/logout` | |
| GET / POST | `/api/stores` | Each store comes back with its latest confirmed visit and latest in-stock sighting. POST geocodes the address, or accepts `lat`/`lng` directly. |
| PATCH / DELETE | `/api/stores/:id` | |
| GET / POST | `/api/stores/:id/visits` | `visited_at, confirmed, in_stock, products, notes, visitor` |
| DELETE | `/api/visits/:id` | |
| GET | `/api/tweets[?online=1]` | cached X posts; `online=1` returns only posts flagged as online drops |
| GET / POST | `/api/events` | upcoming online restocks, entered by hand |
| DELETE | `/api/events/:id` | |
| GET | `/api/geocode?q=` | |

## Setup

You need a Cloudflare account and Node 22+.

```sh
cd pokemon
npm install
npx wrangler login

# 1. Database
npx wrangler d1 create pokemon-restock      # copy the database_id into wrangler.toml
npm run db:migrate:remote

# 2. Secrets
npm run -s hash-password -- 'your shared password' | npx wrangler secret put SITE_PASSWORD_HASH
openssl rand -hex 32 | npx wrangler secret put SESSION_SECRET
npx wrangler secret put X_BEARER_TOKEN      # optional, see below

# 3. Edit X_ACCOUNTS in wrangler.toml, then deploy
npm run deploy
```

### Domain

If `drew.cx` DNS is on Cloudflare, the `routes` entry in `wrangler.toml` attaches `pokemon.drew.cx` automatically on deploy. If DNS is somewhere else, remove `routes` and add the custom domain in the Cloudflare dashboard (Worker → Settings → Domains & Routes). The dashboard tells you which DNS record to create.

The main drew.cx site on GitHub Pages is unaffected. The repo-root `_config.yml` excludes `pokemon/` so this code isn't published at `drew.cx/pokemon/`.

### X feed

X has no free read API. Reading posts needs a paid X developer account: pay-per-use credits or a Basic plan. The cron makes at most one request per account every 15 minutes and uses `since_id`, so it only fetches new posts. To cut cost further, change `crons` in `wrangler.toml`, for example to `*/30 * * * *`. Without `X_BEARER_TOKEN` the feed stays empty and everything else works.

The "online drop" flag is a keyword match in `src/x.ts` (`ONLINE_RE`). Adjust it to match how your accounts write their posts.

## Local development

```sh
cp .dev.vars.example .dev.vars
npm run -s hash-password -- pikachu          # paste into SITE_PASSWORD_HASH in .dev.vars
npm run db:migrate:local
npm run dev                                  # http://localhost:8787
npm test && npm run typecheck
```

## Maintenance

- **Password change:** rerun the hash-password step and `wrangler secret put SITE_PASSWORD_HASH`. Everyone gets logged out.
- **Schema change:** add `migrations/0002_*.sql`, then run `npm run db:migrate:remote`.
- **Old tweets:** the cron deletes tweets older than 30 days.
- **Backups:** `npx wrangler d1 export pokemon-restock --remote --output backup.sql`
