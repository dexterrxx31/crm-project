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
| `bun run test` | Vitest |
| `bun run test:e2e` | Playwright |

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

## Multi-tenancy

Every business table carries `organization_id` and is protected by a Postgres row-level
security policy. Server Actions run through a `withOrg` wrapper that resolves the caller's
organization and role from the session and sets the Postgres session variable the policies
read — so a missing `where` clause fails closed rather than leaking across tenants.
