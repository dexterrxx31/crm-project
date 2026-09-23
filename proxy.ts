import { getSessionCookie } from "better-auth/cookies";
import { type NextRequest, NextResponse } from "next/server";

/** Next.js 16 renamed `middleware` to `proxy` (Node.js runtime, not configurable).
 * This is an **optimistic** check only — looks for a session cookie without verifying
 * it, to avoid rendering the shell for obviously-signed-out visitors. Real enforcement
 * is `requireOrgContext()` + Postgres RLS, on every data access. */
export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const hasSessionCookie = Boolean(getSessionCookie(request));

  const isAuthRoute = pathname === "/login" || pathname === "/signup";

  if (!hasSessionCookie && !isAuthRoute) {
    const url = new URL("/login", request.url);
    // Preserve where they were heading so login can send them back.
    if (pathname !== "/") url.searchParams.set("next", pathname);
    return NextResponse.redirect(url);
  }

  if (hasSessionCookie && isAuthRoute) {
    return NextResponse.redirect(new URL("/dashboard", request.url));
  }

  return NextResponse.next();
}

export const config = {
  // Everything except Next internals, static files, the auth handler, and the
  // Inngest webhook — the latter is called by Inngest's own infrastructure
  // (sync, invocation) with no user session; its security boundary is
  // INNGEST_SIGNING_KEY, verified inside the route handler, not this cookie
  // check.
  matcher: [
    "/((?!api/auth|api/inngest|_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
