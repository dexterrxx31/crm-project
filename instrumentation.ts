import { hasSentryDsn } from "@/lib/env";

/** Server-side observability bootstrap. Sentry.init only runs when SENTRY_DSN is set,
 * same degrade-without-a-key posture as every other optional integration. No edge
 * branch — this app has no edge runtime (proxy.ts is Node-only per Next 16). */
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
