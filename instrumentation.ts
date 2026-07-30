import { hasSentryDsn } from "@/lib/env";

/**
 * Server-side observability bootstrap. Sentry is optional in dev (see
 * `.env.example`) — `Sentry.init` is only called when `SENTRY_DSN` is set,
 * same degrade-without-a-key posture as the AI and rate-limit integrations.
 * Only a Node runtime exists in this app (proxy.ts has none per Next 16;
 * no other code runs on the edge runtime), so there's no edge branch here.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs" && hasSentryDsn()) {
    const Sentry = await import("@sentry/nextjs");
    Sentry.init({
      dsn: process.env.SENTRY_DSN,
      tracesSampleRate: 0.1,
    });
  }
}

export async function onRequestError(
  ...args: Parameters<typeof import("@sentry/nextjs").captureRequestError>
) {
  if (!hasSentryDsn()) return;
  const Sentry = await import("@sentry/nextjs");
  Sentry.captureRequestError(...args);
}
