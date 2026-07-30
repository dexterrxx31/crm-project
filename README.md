# Synapse CRM

An AI-native, multi-tenant CRM. Accounts, contacts, leads, a deal pipeline and an activity
timeline — plus a Claude agent that can read and act on all of it.

## Stack

| Layer | Choice |
|---|---|
| Framework | Next.js 16 (App Router), React 19, TypeScript strict |
| Package manager | Bun |
| Lint / format | Biome |
| UI | Tailwind v4, shadcn/ui, TanStack Table, Recharts, nuqs |
| Server logic | Server Actions via `next-safe-action` |
| Database | Postgres + pgvector, Drizzle ORM, row-level security |
| Auth | Better Auth (organization plugin) |
| Background jobs | Inngest |
| Realtime | Postgres `LISTEN/NOTIFY` → SSE |
| Email | Resend + React Email |
| AI | `@anthropic-ai/sdk` (`claude-opus-5`), Voyage embeddings in pgvector |
| Rate limiting | Upstash Redis (sliding window, per-org, on `/api/ai/*`) |
| Observability | Sentry (errors), PostHog (product analytics) |

## Getting started

Requires [Bun](https://bun.sh) and Docker.

```bash
bun install
cp .env.example .env.local     # fill in what you have; see "Without API keys" below
bun run db:up                  # Postgres 17 + pgvector via Docker
bun run db:migrate
bun run db:seed
bun dev                        # http://localhost:3000
```

### Two database roles

`DATABASE_URL` and `DATABASE_ADMIN_URL` are deliberately different roles:

- **`DATABASE_ADMIN_URL`** (`synapse`) owns the schema and is used *only* by migrations.
- **`DATABASE_URL`** (`synapse_app`) is what the app connects as. It is not a superuser and
  does not have `BYPASSRLS`.

This is not ceremony. A Postgres superuser **bypasses row-level security entirely**, even on
tables marked `FORCE ROW LEVEL SECURITY` — so running the app as the owner role would make
every tenant policy silently ineffective while still looking correct in `pg_policies`.
`bun run db:migrate` creates the app role and then asserts it cannot bypass RLS, failing the
migration if it can.

### Running Docker under Colima

If `bun run db:migrate` fails with `ECONNREFUSED 127.0.0.1:5433` while `docker compose ps`
shows the container healthy, Colima is not forwarding the published port to the host. Open a
tunnel to the VM:

```bash
ssh -F ~/.colima/ssh_config -f -N -L 5433:127.0.0.1:5433 colima
```

That lasts until the VM restarts. For a permanent fix, restart Colima with a host-reachable
address (`colima stop && colima start --network-address`) and point `DATABASE_URL` at the IP
shown by `colima list`. Docker Desktop users are unaffected.

### Background jobs (Inngest)

Scoring, embedding and the nightly sweep run through Inngest, which is a second local
process:

```bash
bun run inngest:dev            # http://localhost:8288 — discovers functions from /api/inngest
```

`INNGEST_DEV=1` (set by default in `.env.example`) tells the SDK to talk to this local dev
server instead of Inngest Cloud — without it, `/api/inngest` responds in "cloud mode" and
rejects requests for lack of a signing key. Unset it (or set to `0`) in production, where
`INNGEST_SIGNING_KEY` takes over.

### Without API keys

Only `DATABASE_URL` and `BETTER_AUTH_SECRET` are required to run the CRM. The AI features
degrade gracefully: without `ANTHROPIC_API_KEY` the agent returns a clear "AI not configured"
message and the scoring/embedding jobs no-op instead of throwing. Phases of the app that need
Resend, Upstash, Sentry or PostHog are similarly optional in development.

## Commands

| Command | Does |
|---|---|
| `bun dev` | Dev server |
| `bun run build` | Production build |
| `bun run typecheck` | `tsc --noEmit` |
| `bun run lint` / `lint:fix` | Biome check |
| `bun run db:up` / `db:down` | Start/stop local Postgres |
| `bun run db:generate` | Generate a migration from schema changes |
| `bun run db:migrate` | Apply migrations |
| `bun run db:seed` | Load demo fixtures |
| `bun run db:reset` | Drop, recreate, migrate and seed |
| `bun run db:studio` | Drizzle Studio |
| `bun run inngest:dev` | Inngest dev server |
| `bun run test` / `test:watch` | Vitest |
| `bun run test:e2e` | Playwright (builds and starts its own server) |

## Layout

```
app/
  (auth)/          login, signup
  (app)/           dashboard, accounts, contacts, leads, deals, activities, search, settings
  api/             auth handler, AI chat (SSE), realtime events (SSE), Inngest
components/        ui/ (shadcn), crm/ (domain components)
lib/
  db/              Drizzle schema, migrations, RLS policies, seed
  auth.ts          Better Auth config
  validators/      Zod schemas shared by forms, actions and the DB layer
  ai/              agent, tools, scoring, summarize, embed
  inngest/         background jobs
  email/           React Email templates
tests/             unit (Vitest) and e2e (Playwright)
```

## Tests and CI

- `bun run test` — Vitest, for validators, the scoring output schema, and the `tenantDb` RLS
  helper. No database needed; `tests/setup.ts` fills in a placeholder `DATABASE_URL` so
  modules that build a (lazy, unconnected) Postgres client at import time don't throw.
- `bun run test:e2e` — Playwright. One golden-path spec: sign up → create an account → create
  a contact → create a deal → drag it to another stage on the board → ask the agent chat a
  question. `playwright.config.ts` builds and starts a production server itself, so this needs
  a real, migrated Postgres (`bun run db:up && bun run db:migrate` first). The agent step
  asserts the chat pipeline degrades to a clear "not configured" message — it doesn't require
  `ANTHROPIC_API_KEY`, matching every other AI path in this app.
- `.github/workflows/ci.yml` runs typecheck, Biome, Vitest and Playwright on every push and PR,
  against a `pgvector/pgvector:pg17` service container it migrates from scratch. All AI,
  rate-limiting and observability env vars are left unset in CI on purpose — that's the
  condition the degrade-gracefully behavior above is supposed to hold under.

## Deploying

Vercel (app) + Neon (Postgres). Both are zero-config for a standard Next.js app; the parts
that need attention are specific to this project:

1. **Neon**: create a project — enabling the `pgvector` extension is not a separate manual
   step, `bun run db:migrate` runs `CREATE EXTENSION IF NOT EXISTS vector` itself. Copy Neon's
   **pooled** connection string for `DATABASE_URL` and its **direct** (unpooled) connection
   string for `DATABASE_ADMIN_URL` — migrations run DDL and a role-bypass-RLS check that
   should not go through a transaction pooler.
2. **Run migrations once against Neon** before the first deploy (and after any schema
   change): `DATABASE_ADMIN_URL=... DATABASE_URL=... bun run db:migrate` from a machine that
   can reach Neon. Vercel's build step does not run this for you.
3. **Vercel**: import the repo — bun is auto-detected from `bun.lock`, build command is the
   default `next build`. Set every var from `.env.example` that applies: `DATABASE_URL`,
   `DATABASE_ADMIN_URL` (only needed where you run migrations from, not on Vercel itself),
   `BETTER_AUTH_SECRET`, `BETTER_AUTH_URL` (your production origin), plus whichever of the
   optional AI/Resend/Upstash/Sentry/PostHog/Inngest keys you're using — all of them are
   optional at runtime (see "Without API keys" above).
4. **Inngest**: in production, `INNGEST_DEV` must be unset. Register the app at
   inngest.com pointing at `https://<your-domain>/api/inngest` and set
   `INNGEST_EVENT_KEY`/`INNGEST_SIGNING_KEY` — without them the route responds in "cloud mode"
   and rejects sync/invocation requests (see "Background jobs" above; the same failure mode
   that motivated `proxy.ts` excluding this route from the auth-cookie check).

## Multi-tenancy

Every business table carries `organization_id` and is protected by a Postgres row-level
security policy. Server Actions run through a `withOrg` wrapper that resolves the caller's
organization and role from the session and sets the Postgres session variable the policies
read — so a missing `where` clause fails closed rather than leaking across tenants.
