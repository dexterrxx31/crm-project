# Investigation Log

## 2026-11-04: CRM review fixes

Status: resolved

### Goal

Recheck and resolve the six findings from the repository review.

### Findings

- [confirmed] Proxy redirects cookie-bearing login requests without session validation; the app layout redirects missing org contexts to login.
  Evidence: `proxy.ts`, `app/(app)/layout.tsx`.
- [confirmed] Contact and deal mutations accept linked IDs without tenant-scoped lookups. Their foreign keys contain only record IDs.
  Evidence: `lib/actions/contacts.ts`, `lib/actions/deals.ts`, `lib/db/schema.ts`.
- [confirmed] Optional field preprocessors turn blanks into undefined, which update sets omit.
  Evidence: `lib/validators/crm.ts`, `lib/actions/contacts.ts`.
- [confirmed] Lead conversion checks status before acquiring a row lock.
  Evidence: `lib/actions/leads.ts`.
- [confirmed] Manual scoring and index backfills run inline, and AI actions do not call the AI rate limiter.
  Evidence: `lib/actions/ai.ts`.
- [confirmed] AI error mapping returns arbitrary error messages to the client.
  Evidence: `lib/actions/ai.ts`, `friendlyAiError`.

### Issues

- Stale-cookie login loop: resolved by keeping auth routes reachable. Proxy regression tests pass.
- Unchecked tenant references: resolved at the mutation boundary for contacts, deals and activity subjects. Action rejection tests pass; live RLS verification remains outstanding.
- Optional fields could not be cleared: resolved with update-specific null handling. Validator and action regression tests pass.
- Duplicate concurrent lead conversion: added a row lock before checking conversion status. Lock/rejection test passes; real concurrent database execution remains outstanding.
- Inline manual scoring and backfills without rate limits: resolved by queueing jobs, adding a registered backfill handler, and applying the organization AI rate limiter to AI actions. Queue/rate-limit tests pass.
- Internal AI error exposure: resolved with generic messages for unexpected errors and server-side logging. Error-sanitization tests pass.
- Background handlers lacked missing-key guards despite README claims: resolved for scoring, incremental embedding and backfill jobs. Missing-key job tests pass.

### Decisions

- Validate relationships inside tenant transactions without changing the schema or RLS policies.
- Keep login reachable regardless of cookie presence; retain authorization in the app layout and actions.
- Preserve create input behavior and give update schemas explicit null values for cleared fields.
- Reuse existing scoring events and add a backfill event. Report queued work honestly in the UI.
- Preserve the pre-existing AGENTS.md edit. The user authorized committing and pushing the fixes in a follow-up.

### Open questions

- Real PostgreSQL concurrency and RLS behavior still needs verification in a migrated test database; the action tests use tenant query doubles.

### Verification

- Ran: `docker compose ps`: fail. Colima Docker socket does not exist; daemon unavailable.
- Ran: `bun run typecheck`: pass after implementation and after adding regression tests.
- Ran: `bun run test -- tests/unit/crm-actions.test.ts tests/unit/proxy.test.ts`: pass, 18 tests.
- Regression tests cover proxy recovery, linked-record rejection before writes, null updates, conversion rejection with locking, queue submission/failures, missing configuration, rate limiting and error sanitization.
- Ran: targeted `bunx biome check --write`: initially failed on the intentionally thenable Drizzle test double; added a focused lint explanation.
- Ran: `bun run test`: pass, 57 tests across 7 files.
- Ran: `bun run lint`: pass, 125 files checked.
- Ran: `git diff --check`: pass.
- Ran: `bun run build` in the sandbox: interrupted with exit 130 after compilation made no progress for several minutes. The same command completed outside the sandbox; the exact cause of the sandbox stall was not established.
- Ran: `bun run build` outside the sandbox: pass, compilation, TypeScript and static generation completed.
- Not run: database-backed concurrency/RLS and browser tests; local Docker daemon is unavailable.
- No schema migrations or dependency changes.
