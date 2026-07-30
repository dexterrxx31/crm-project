// Fallback env for modules that read `lib/env.ts` at import time (e.g.
// `lib/db/index.ts` builds a lazy postgres client from DATABASE_URL as soon
// as it's imported). Only fills in what's missing — a real `.env.local`
// (or CI's Postgres service) still wins.
process.env.DATABASE_URL ??= "postgresql://test:test@localhost:5432/test";
process.env.BETTER_AUTH_SECRET ??= "test-secret-not-used-at-runtime";
