import { z } from "zod";

/** Only DATABASE_URL and BETTER_AUTH_SECRET are required; everything else is optional
 * and consumers must degrade gracefully without it (see lib/ai/client.ts). */

/** Unset and blank both mean "not configured" — .env.example ships blank placeholders,
 * which would otherwise fail `min(1)` the moment someone copies it. */
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
