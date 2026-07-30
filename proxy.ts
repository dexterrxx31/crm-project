import { getSessionCookie } from "better-auth/cookies";
import { type NextRequest, NextResponse } from "next/server";

/**
 * Next.js 16 renamed `middleware` to `proxy`. Its runtime is Node.js and cannot
 * be configured. See node_modules/next/dist/docs/01-app/01-getting-started/16-proxy.md
 *
 * This is an **optimistic** check only: it looks for the presence of a session
 * cookie to avoid rendering the app shell for obviously-signed-out visitors.
 * It is not the authorization boundary — the cookie is not verified here.
 * Real enforcement lives in `requireOrgContext()` plus the Postgres RLS
 * policies, both of which run on every data access.
 */
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
  // Everything except Next internals, the auth handler itself, and static files.
  matcher: [
    "/((?!api/auth|_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
