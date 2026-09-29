-- Stores the group has added by hand.
CREATE TABLE stores (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  name          TEXT    NOT NULL,              -- e.g. "Target #1234"
  chain         TEXT    NOT NULL DEFAULT '',   -- e.g. "Target", "Walmart", "Dollar General"
  address       TEXT    NOT NULL,
  lat           REAL    NOT NULL,
  lng           REAL    NOT NULL,
  restock_notes TEXT    NOT NULL DEFAULT '',   -- e.g. "Vendor comes Tue/Thu mornings"
  created_at    TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
  updated_at    TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
);

-- One row per trip someone made to a store.
CREATE TABLE visits (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  store_id    INTEGER NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  visited_at  TEXT    NOT NULL,                -- ISO timestamp of the visit
  confirmed   INTEGER NOT NULL DEFAULT 1,      -- 1 = actually checked the shelf
  in_stock    INTEGER NOT NULL DEFAULT 0,      -- 1 = there was Pokemon product
  products    TEXT    NOT NULL DEFAULT '',     -- what was there / what was bought
  notes       TEXT    NOT NULL DEFAULT '',
  visitor     TEXT    NOT NULL DEFAULT '',     -- free-text nickname, not an account
  created_at  TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
);
CREATE INDEX visits_store_time ON visits (store_id, visited_at DESC);

-- Posts cached from the X accounts in X_ACCOUNTS.
CREATE TABLE tweets (
  id          TEXT PRIMARY KEY,                -- X post id
  handle      TEXT NOT NULL,
  text        TEXT NOT NULL,
  url         TEXT NOT NULL,
  posted_at   TEXT NOT NULL,
  is_online   INTEGER NOT NULL DEFAULT 0,      -- keyword match for online drops
  fetched_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
);
CREATE INDEX tweets_posted ON tweets (posted_at DESC);

-- Upcoming online restock drops, entered by the group.
CREATE TABLE events (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  title       TEXT NOT NULL,                   -- e.g. "Prismatic Evolutions ETB drop"
  retailer    TEXT NOT NULL DEFAULT '',        -- e.g. "Pokemon Center", "Target.com"
  starts_at   TEXT NOT NULL,                   -- ISO timestamp
  url         TEXT NOT NULL DEFAULT '',
  notes       TEXT NOT NULL DEFAULT '',
  created_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
);
CREATE INDEX events_starts ON events (starts_at);

-- Key/value for small bits of state (X since_ids, user id cache).
CREATE TABLE kv (
  k TEXT PRIMARY KEY,
  v TEXT NOT NULL
);

-- Failed login attempts, for simple per-IP throttling.
CREATE TABLE login_failures (
  ip    TEXT NOT NULL,
  at    INTEGER NOT NULL                       -- unix seconds
);
CREATE INDEX login_failures_ip ON login_failures (ip, at);
