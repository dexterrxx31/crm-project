import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { nextCookies } from "better-auth/next-js";
import { organization } from "better-auth/plugins";
import { db } from "@/lib/db";
import * as schema from "@/lib/db/auth-schema";

export const auth = betterAuth({
  database: drizzleAdapter(db, {
    provider: "pg",
    schema,
  }),
  emailAndPassword: {
    enabled: true,
    // Email verification is off in development so the seeded demo login works
    // without an outbound mail provider configured.
    requireEmailVerification: false,
  },
  session: {
    expiresIn: 60 * 60 * 24 * 7, // 7 days
    updateAge: 60 * 60 * 24, // refresh once a day
  },
  plugins: [
    organization({
      // A user belongs to exactly one org in this build; the plugin still gives
      // us membership roles, invitations, and the activeOrganizationId that the
      // withOrg action wrapper reads.
      allowUserToCreateOrganization: true,
      membershipLimit: 100,
    }),
    // Must stay last: nextCookies wraps the response so that auth calls made
    // from Server Actions can set cookies. Ordering is load-bearing here.
    nextCookies(),
  ],
});

export type Auth = typeof auth;
