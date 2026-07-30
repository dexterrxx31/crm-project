import * as Sentry from "@sentry/nextjs";
import posthog from "posthog-js";

/**
 * Browser-side observability. Both SDKs are optional — `NEXT_PUBLIC_*` vars
 * are inlined at build time, so an unset key means the `if` below never
 * runs and neither SDK loads, rather than initializing against an empty
 * string and failing at request time.
 */
if (process.env.NEXT_PUBLIC_SENTRY_DSN) {
  Sentry.init({
    dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
    tracesSampleRate: 0.1,
  });
}

if (process.env.NEXT_PUBLIC_POSTHOG_KEY) {
  posthog.init(process.env.NEXT_PUBLIC_POSTHOG_KEY, {
    api_host: process.env.NEXT_PUBLIC_POSTHOG_HOST ?? "https://us.i.posthog.com",
    person_profiles: "identified_only",
    capture_pageview: true,
  });
}

// Lets Sentry attribute errors to the client-side navigation in progress.
export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;
