-- The X feed was removed; drop its cache tables.
DROP INDEX IF EXISTS tweets_posted;
DROP TABLE IF EXISTS tweets;
DROP TABLE IF EXISTS kv;
