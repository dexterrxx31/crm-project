import { z } from "zod";

/**
 * Server-side environment.
 *
 * Only DATABASE_URL and BETTER_AUTH_SECRET are required — everything else is
 * optional so the CRM runs locally without third-party accounts. Consumers of
 * the optional keys must check for presence and degrade gracefully rather than
 * assuming a value (see `lib/ai/client.ts` for the pattern).
 */
/**
 * An unset key and a key present-but-blank both mean "not configured".
 * `.env.example` ships blank placeholders, so without this coercion every
 * optional key would fail `min(1)` the moment someone copies the example file.
 */
const optionalString = z.preprocess(
  (value) => (typeof value === "string" && value.trim() === "" ? undefined : value),
  z.string().min(1).optional(),
);

const serverSchema = z.object({
  DATABASE_URL: z.string().min(1, "DATABASE_URL is required — see .env.example"),
  // Owner/DDL connection. Only migrations use it; absent at runtime in prod.
  DATABASE_ADMIN_URL: optionalString,
  BETTER_AUTH_SECRET: z
    .string()
    .min(1, "BETTER_AUTH_SECRET is required — generate with: openssl rand -base64 32"),
  BETTER_AUTH_URL: z.url().default("http://localhost:3000"),

  ANTHROPIC_API_KEY: optionalString,
  VOYAGE_API_KEY: optionalString,

  INNGEST_EVENT_KEY: optionalString,
  INNGEST_SIGNING_KEY: optionalString,

  RESEND_API_KEY: optionalString,
  RESEND_FROM_EMAIL: z.string().default("Synapse CRM <onboarding@resend.dev>"),

  UPSTASH_REDIS_REST_URL: optionalString,
  UPSTASH_REDIS_REST_TOKEN: optionalString,

  SENTRY_DSN: optionalString,
});

/**
 * Client-side environment. `NEXT_PUBLIC_*` vars are inlined into the bundle
 * at build time, so this schema only documents the shape — it isn't a gate
 * that can hide the value at runtime the way `serverSchema` hides secrets.
 */
const clientSchema = z.object({
  NEXT_PUBLIC_POSTHOG_KEY: optionalString,
  NEXT_PUBLIC_POSTHOG_HOST: z.string().default("https://us.i.posthog.com"),
  // Sentry DSNs aren't secret (they only accept writes, scoped to one
  // project) — the wizard-standard setup exposes the same value under both
  // this and `SENTRY_DSN` so client and server error capture share one DSN.
  NEXT_PUBLIC_SENTRY_DSN: optionalString,
});

export type ServerEnv = z.infer<typeof serverSchema>;

let cached: ServerEnv | undefined;

/**
 * Parsed once, lazily. Lazy so that `next build` does not require a database
 * URL to be present at build time — only code paths that actually touch the
 * database will fail, and they fail with a readable message.
 */
export function env(): ServerEnv {
  if (cached) return cached;

  const parsed = serverSchema.safeParse(process.env);
  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((issue) => `  - ${issue.path.join(".")}: ${issue.message}`)
      .join("\n");
    throw new Error(`Invalid environment configuration:\n${issues}`);
  }

  cached = parsed.data;
  return cached;
}

/** True when the Anthropic key is configured; AI routes check this before calling out. */
export function hasAnthropicKey(): boolean {
  return Boolean(process.env.ANTHROPIC_API_KEY);
}

/** True when the Voyage key is configured; embedding jobs no-op without it. */
export function hasVoyageKey(): boolean {
  return Boolean(process.env.VOYAGE_API_KEY);
}

/** True when Sentry is configured; `instrumentation.ts` skips `Sentry.init` without it. */
export function hasSentryDsn(): boolean {
  return Boolean(process.env.SENTRY_DSN);
}

let cachedClientEnv: z.infer<typeof clientSchema> | undefined;

/**
 * Parsed client env, safe to call from `"use client"` code — reads only the
 * `NEXT_PUBLIC_*` vars Next.js inlines into the browser bundle.
 */
export function clientEnv(): z.infer<typeof clientSchema> {
  if (cachedClientEnv) return cachedClientEnv;
  cachedClientEnv = clientSchema.parse({
    NEXT_PUBLIC_POSTHOG_KEY: process.env.NEXT_PUBLIC_POSTHOG_KEY,
    NEXT_PUBLIC_POSTHOG_HOST: process.env.NEXT_PUBLIC_POSTHOG_HOST,
    NEXT_PUBLIC_SENTRY_DSN: process.env.NEXT_PUBLIC_SENTRY_DSN,
  });
  return cachedClientEnv;
}
