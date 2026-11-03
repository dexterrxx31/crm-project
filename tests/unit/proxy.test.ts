import { NextRequest } from "next/server";
import { describe, expect, it } from "vitest";
import { proxy } from "@/proxy";

function request(path: string, cookie = false) {
  return new NextRequest(`http://localhost:3000${path}`, {
    headers: cookie ? { cookie: "better-auth.session_token=stale-session" } : {},
  });
}

describe("proxy session recovery", () => {
  it.each(["/login", "/signup"])("keeps %s accessible with a stale session cookie", (path) => {
    const response = proxy(request(path, true));
    expect(response.headers.get("location")).toBeNull();
  });

  it("redirects a signed-out protected request to login", () => {
    const response = proxy(request("/accounts"));
    expect(response.headers.get("location")).toBe("http://localhost:3000/login?next=%2Faccounts");
  });

  it("leaves cookie verification to the protected app", () => {
    expect(proxy(request("/dashboard", true)).headers.get("location")).toBeNull();
  });
});
