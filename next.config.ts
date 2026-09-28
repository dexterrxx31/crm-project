import { withSentryConfig } from "@sentry/nextjs/config";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  async headers() {
    return [
      {
        // A CSP isn't included here — this app loads Sentry, PostHog, and Google
        // Fonts from a mix of inline and external script sources, and getting a
        // CSP wrong silently breaks those rather than failing loudly. Worth doing
        // as its own careful pass, not bundled into a general header baseline.
        source: "/:path*",
        headers: [
          { key: "X-Frame-Options", value: "DENY" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" },
        ],
      },
    ];
  },
};

// `withSentryConfig` is safe to apply unconditionally — without SENTRY_DSN
// set, `instrumentation.ts`/`instrumentation-client.ts` never call
// `Sentry.init`, so this only adds a build-time source map upload step,
// which itself no-ops (with a warning) when SENTRY_AUTH_TOKEN is unset.
export default withSentryConfig(nextConfig, {
  silent: true,
});
