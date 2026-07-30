<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# Synapse CRM

An AI-native, multi-tenant CRM. See `README.md` for the stack and commands.

## Next.js 16 gotchas that bite

Verified against `node_modules/next/dist/docs/01-app/02-guides/upgrading/version-16.md`:

- **`middleware.ts` is now `proxy.ts`** at the project root, exporting a function named `proxy`.
  Its runtime is **Node.js and cannot be configured** — there is no edge runtime for proxy.
- **All request APIs are async.** `cookies()`, `headers()`, `draftMode()`, and `params` /
  `searchParams` in `page.tsx`, `layout.tsx`, and `route.ts` must be awaited. Synchronous
  access was removed, not deprecated.
- **Use the generated route types**: `PageProps<'/deals/[id]'>`, `LayoutProps<'/...'>`,
  `RouteContext<'/...'>` are globally available. Run `bunx next typegen` after adding routes.
- **Turbopack is the default** for both `dev` and `build`.
- **`next lint` is removed.** Linting is Biome (`bun run lint`), not ESLint.
- Proxy is for optimistic redirects only — never treat it as the authorization boundary.

## Conventions

- **Package manager is Bun.** Use `bun add`, not `npm install`.
- **Lint/format is Biome**, not ESLint/Prettier. `bun run lint:fix` before committing.
  `components/ui/**` (shadcn-generated) is excluded from linting — don't hand-fix it.
- **Every business table carries `organization_id`** and is covered by a Postgres RLS policy.
  Database access must go through the `withOrg` action wrapper, which sets the Postgres
  session variable the policies read. A query missing a tenant filter must fail closed.
- **Zod schemas live in `lib/validators/`** and are shared by the form, the Server Action and
  the DB layer. Don't redeclare a shape in more than one place.
- **Mutations are Server Actions** via `next-safe-action`. Route Handlers are only for SSE
  streams (`/api/ai/chat`, `/api/events`) and webhooks (`/api/inngest`).
- **Anything slow or expensive is an Inngest job**, not inline request work. That includes
  every embedding call and every AI scoring pass.

## AI rules

- Model IDs: `claude-opus-5` (default), `claude-haiku-4-5` (cheap classification). These are
  current; do not "correct" them to older names.
- Use `thinking: { type: "adaptive" }`. `budget_tokens` and `temperature`/`top_p`/`top_k`
  return a 400 on Opus 5.
- Control depth with `output_config: { effort: "..." }`.
- **Always check `stop_reason === "refusal"` before reading `content`** — content may be empty.
- Stream (`client.messages.stream()`) for anything with a large `max_tokens`.
- Anthropic has no embeddings endpoint — embeddings are Voyage (`voyage-3`).
- Every AI path must degrade gracefully when `ANTHROPIC_API_KEY` is unset.
