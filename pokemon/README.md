# Pokemon Restock Tracker (pokemon.drew.cx)

A private map of local stores where the group logs Pokemon card restocks, plus a list of upcoming online restock drops. The whole site sits behind one shared password.

## Stack

| Piece | Choice | Why |
|---|---|---|
| Hosting + backend | **One Cloudflare Worker** with static assets | A single deploy serves both the static files and the small API. It fits in the free tier and there's no server to patch. |
| Database | **Cloudflare D1** (SQLite) | Stores, visits and online restock events. Also free tier. |
| Frontend | **Plain HTML/CSS/JS modules**, no build step | Nothing to upgrade and nothing to compile. |
| Map | **Leaflet** (vendored in `public/vendor/`) + OpenStreetMap tiles | Free, and no API key. |
| Geocoding | **US Census geocoder** | Free, no key, USA only. If an address doesn't match, you tap the map to place the pin. |
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
├── wrangler.toml            Worker config: domain, assets, D1 binding, vars
├── migrations/            D1 schema (stores, visits, events, login_failures)
├── scripts/hash-password.mjs  Prints the SITE_PASSWORD_HASH value for a password
├── src/
│   ├── index.ts             Router: password gate, JSON API
│   ├── auth.ts              PBKDF2 password check + signed session cookie
│   ├── geocode.ts           US Census geocoder
│   └── *.test.ts            node:test unit tests
└── public/                  Static site (served only after login)
    ├── index.html           App shell: map / list / drops views, hamburger drawer, dialogs
    ├── login.html, login.js Password page
    ├── robots.txt
    ├── styles.css
    ├── js/
    │   ├── app.js           State, filters, drawer, dialogs, wiring
    │   ├── map.js           Leaflet map, pins and popups
    │   ├── list.js          Sortable store list
    │   ├── drops.js         Upcoming online restocks
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

# 3. Deploy
npm run deploy
```

### Domain

`drew.cx` is a Cloudflare zone, so the `routes` entry in `wrangler.toml` attaches `pokemon.drew.cx` to the Worker on deploy and Cloudflare creates the DNS record and certificate itself. Don't add a `pokemon` DNS record by hand; if one already exists, delete it first or the deploy will refuse to attach the domain.

The main drew.cx site on GitHub Pages is unaffected. The repo-root `_config.yml` excludes `pokemon/` so this code isn't published at `drew.cx/pokemon/`.

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
- **Backups:** `npx wrangler d1 export pokemon-restock --remote --output backup.sql`
