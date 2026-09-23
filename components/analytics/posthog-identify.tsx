"use client";

import posthog from "posthog-js";
import { useEffect } from "react";

/** Ties the anonymous PostHog session to the signed-in user/org once per mount.
 * Skipped when NEXT_PUBLIC_POSTHOG_KEY is unset, to avoid queuing events that
 * will never be flushed. */
export function PosthogIdentify({
  userId,
  userEmail,
  organizationId,
  organizationName,
}: {
  userId: string;
  userEmail: string;
  organizationId: string;
  organizationName: string;
}) {
  useEffect(() => {
    if (!process.env.NEXT_PUBLIC_POSTHOG_KEY) return;
    posthog.identify(userId, { email: userEmail });
    posthog.group("organization", organizationId, { name: organizationName });
  }, [userId, userEmail, organizationId, organizationName]);

  return null;
}
