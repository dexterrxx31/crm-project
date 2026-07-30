import { withSentryConfig } from "@sentry/nextjs";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
};

// `withSentryConfig` is safe to apply unconditionally — without SENTRY_DSN
// set, `instrumentation.ts`/`instrumentation-client.ts` never call
// `Sentry.init`, so this only adds a build-time source map upload step,
// which itself no-ops (with a warning) when SENTRY_AUTH_TOKEN is unset.
export default withSentryConfig(nextConfig, {
  silent: true,
});
