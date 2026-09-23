# Synapse CRM

Synapse is a CRM (a system for tracking companies, the people at them, and the deals you're
working with them) built for one thing on top of the usual CRM basics: an AI agent that can
read your data and act on it. Ask it "what deals are closing this month?" and it answers from
your actual pipeline. Ask it to log a call or move a deal, and it does — after you confirm the
change, the same way any other write to the CRM works.

Each customer/company that signs up gets its own private workspace ("organization") — nobody
outside it can ever see or touch its data, enforced at the database level, not just in the app
code (more on that under "Multi-tenancy" below).

## What's in here

| Layer | Choice | Why it's here |
|---|---|---|
| Framework | Next.js 16 (App Router), React 19, TypeScript strict | The app itself — pages, forms, API routes |
| Package manager | Bun | Faster installs and scripts than npm/yarn |
| Lint / format | Biome | One tool instead of ESLint + Prettier |
| UI | Tailwind v4, shadcn/ui, TanStack Table, Recharts, nuqs | Styling, ready-made components, data tables, charts |
| Server logic | Server Actions via `next-safe-action` | How forms save data — validated functions the browser calls directly |
| Database | Postgres + pgvector, Drizzle ORM, row-level security | Where everything is stored, plus AI similarity search |
| Auth | Better Auth (organization plugin) | Sign-in/sign-up and the one-workspace-per-company model |
| Background jobs | Inngest | Work that shouldn't block a page load — AI scoring, search indexing |
| Realtime | Postgres `LISTEN/NOTIFY` → Server-Sent Events (SSE) | So a deal moved in one browser tab shows up in another instantly |
| Rate limiting | Upstash Redis | Caps how many AI requests one workspace can fire per minute |
| Observability | Sentry (errors), PostHog (usage analytics) | Finding out when something breaks or how the app gets used |
| AI | `@anthropic-ai/sdk` (`claude-opus-5`), Voyage embeddings | The agent chat, lead/deal scoring, and semantic search |

Everything from "Background jobs" down is **optional** — the app runs and is fully usable
without any of it configured (Auth needs a secret, but not a third-party account). See "Running
without API keys" below.

## Getting started

You need [Bun](https://bun.sh) (the JavaScript runtime and package manager this project uses)
and Docker (to run a local Postgres database in a container).

```bash
bun install
cp .env.example .env.local     # fill in what you have; see "Running without API keys" below
bun run db:up                  # starts Postgres 17 + the pgvector extension via Docker
bun run db:migrate             # creates the database tables
bun run db:seed                # loads sample accounts/contacts/deals so the app isn't empty
bun dev                        # http://localhost:3000
```

### Two database logins, on purpose

`.env.local` has both a `DATABASE_URL` and a `DATABASE_ADMIN_URL`, pointing at two different
Postgres roles:

- **`DATABASE_ADMIN_URL`** (role `synapse`) owns the schema and is used *only* by migrations —
  the scripts that create/change tables.
- **`DATABASE_URL`** (role `synapse_app`) is what the running app connects as, every single
  request. It is deliberately *not* a superuser.

This isn't ceremony. Postgres superusers **bypass row-level security entirely** — the exact
mechanism that keeps one company's data invisible to another (see "Multi-tenancy"). If the app
ran as the owner role, every tenant boundary would be silently ineffective while still looking
correct if you inspected the policies. `bun run db:migrate` double-checks this: it creates the
app role and then verifies it truly cannot bypass RLS, failing loudly if it can.

### If Docker can't reach Postgres (Colima users)

If `bun run db:migrate` fails with `ECONNREFUSED 127.0.0.1:5433` even though
`docker compose ps` shows the container healthy, [Colima](https://github.com/abiosoft/colima)
(a Docker Desktop alternative) isn't forwarding the container's port to your Mac. Open a
tunnel manually:

```bash
ssh -F ~/.colima/ssh_config -f -N -L 5433:127.0.0.1:5433 colima
```

That lasts until the Colima VM restarts. For a fix that survives restarts, run
`colima stop && colima start --network-address` and point `DATABASE_URL` at the IP shown by
`colima list`. Docker Desktop users never hit this.

### Background jobs (Inngest)

Lead/deal scoring, search indexing, and a nightly re-scoring sweep all run as background jobs
through Inngest, rather than making a page wait on them. Locally that means running a second
process alongside `bun dev`:

```bash
bun run inngest:dev            # http://localhost:8288 — a dashboard for local background jobs
```

This only works with `INNGEST_DEV=1` set (already the default in `.env.example`) — without it,
the app assumes it's talking to real Inngest Cloud infrastructure and rejects the local dev
server's requests. In production, unset `INNGEST_DEV` and set `INNGEST_SIGNING_KEY` instead
(see "Deploying" below).

### Running without API keys

Only `DATABASE_URL` and `BETTER_AUTH_SECRET` are required to run the CRM day to day. Every AI
feature degrades gracefully without `ANTHROPIC_API_KEY`: the agent chat says plainly that AI
isn't configured, and the scoring/embedding background jobs quietly skip themselves instead of
erroring. The same is true for Upstash (rate limiting), Sentry, and PostHog (observability) —
none of them are required for the app to work correctly in development.

## Everyday commands

| Command | What it does |
|---|---|
| `bun dev` | Starts the app locally, with live reload |
| `bun run build` | Builds the production version (also what CI and deploys run) |
| `bun run typecheck` | Checks TypeScript types without building anything |
| `bun run lint` / `lint:fix` | Checks code style (Biome); `lint:fix` auto-fixes what it can |
| `bun run db:up` / `db:down` | Starts/stops the local Postgres container |
| `bun run db:generate` | Turns a schema change into a migration file |
| `bun run db:migrate` | Applies pending migrations to the database |
| `bun run db:seed` | Loads demo accounts/contacts/deals |
| `bun run db:reset` | Wipes the local database and rebuilds it from scratch |
| `bun run db:studio` | Opens Drizzle Studio, a GUI for browsing the database |
| `bun run inngest:dev` | Starts the local background-jobs dashboard |
| `bun run test` / `test:watch` | Runs the unit tests (Vitest) |
| `bun run test:e2e` | Runs the end-to-end browser test (Playwright) |

## How the code is organized

```
app/
  (auth)/          login, signup — pages anyone can reach signed out
  (app)/           dashboard, accounts, contacts, leads, deals, activities, search, settings
  api/             the auth handler, AI chat (streamed), realtime events (streamed), Inngest
components/        ui/ (off-the-shelf building blocks), crm/ (this app's own components)
lib/
  db/              database schema, migrations, tenant-isolation policies, demo data
  auth.ts          sign-in/sign-up configuration
  validators/      the rules a form submission must pass, shared by the form and the server
  ai/              the agent, its tools, scoring, summaries, semantic search
  inngest/         background jobs
tests/             unit tests (Vitest) and the end-to-end browser test (Playwright)
```

## Tests and CI

- `bun run test` runs Vitest against the form-validation rules, the shape the AI is required
  to return for a score, and the helper that scopes every database query to one workspace. No
  database needed for these — `tests/setup.ts` fills in a placeholder `DATABASE_URL` so files
  that build a (lazy, not-yet-connected) database client at import time don't throw.
- `bun run test:e2e` runs one Playwright test end to end: sign up, create an account, create a
  contact, create a deal, drag it to a different pipeline stage, and ask the agent chat a
  question. `playwright.config.ts` builds and starts a real production server for this, so it
  needs an actual, migrated Postgres running first (`bun run db:up && bun run db:migrate`).
  The "ask the agent" step doesn't need `ANTHROPIC_API_KEY` — it checks that the chat clearly
  says AI isn't configured, which is exactly what every AI feature in this app is supposed to
  do without a key.
- `.github/workflows/ci.yml` runs typecheck, lint, the unit tests, and the end-to-end test on
  every push and pull request, against a throwaway Postgres it sets up and migrates from
  scratch. None of the AI/rate-limiting/observability keys are set in CI on purpose — that's
  the exact condition the "degrades gracefully" behavior above needs to hold up under.
- `.github/dependabot.yml` opens a pull request automatically when a dependency has an update
  (weekly; small version bumps are grouped into one PR to keep the noise down).

## Deploying

Vercel (hosts the app) + Neon (hosts the database). Both are more or less zero-config for a
standard Next.js app; the parts that need attention are specific to this project:

1. **Neon**: create a project — you don't need to separately enable the `pgvector` extension,
   `bun run db:migrate` does that itself. Copy Neon's **pooled** connection string into
   `DATABASE_URL` and its **direct** (unpooled) connection string into `DATABASE_ADMIN_URL` —
   migrations run schema changes and a safety check that shouldn't go through a connection
   pooler.
2. **Run migrations once against Neon** before the first deploy, and again after any schema
   change: `DATABASE_ADMIN_URL=... DATABASE_URL=... bun run db:migrate`, from any machine that
   can reach Neon. Vercel's build step does not do this for you.
3. **Vercel**: import the repo — Bun is detected automatically from `bun.lock`, and the build
   command is the default `next build`. Set every variable from `.env.example` that applies:
   `DATABASE_URL`, `BETTER_AUTH_SECRET`, `BETTER_AUTH_URL` (your production domain), and
   whichever of the optional AI/Upstash/Sentry/PostHog/Inngest keys you're using — all of them
   stay optional at runtime (see "Running without API keys" above). `DATABASE_ADMIN_URL` only
   needs to exist wherever you're running migrations from, not on Vercel itself.
4. **Inngest**: in production, `INNGEST_DEV` must be unset. Register the app at
   [inngest.com](https://www.inngest.com), pointing it at `https://<your-domain>/api/inngest`,
   and set `INNGEST_EVENT_KEY`/`INNGEST_SIGNING_KEY` — without them the endpoint assumes it's
   being called by someone other than Inngest and refuses the request.

## Multi-tenancy: how one company's data stays invisible to another

Every business table (accounts, contacts, deals, and so on) carries an `organization_id`
column and is protected by a Postgres row-level security (RLS) policy — a rule, enforced by
the database itself, that a query can only see rows belonging to the caller's own
organization. Server Actions (the functions forms call to save data) run through a wrapper
that resolves who's calling and sets the database session variable those policies check.

The point of doing it at the database layer rather than only in application code: a developer
forgetting a `where organization_id = ...` clause somewhere yields an *empty result*, not a
leak of another company's data. The failure mode is "nothing shows up," which gets noticed and
fixed, not "someone else's customer list is visible," which might not be.
