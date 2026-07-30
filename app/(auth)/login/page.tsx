import type { Metadata } from "next";
import { Suspense } from "react";
import { SignInForm } from "@/components/auth/sign-in-form";

export const metadata: Metadata = { title: "Sign in" };

export default function LoginPage() {
  return (
    // useSearchParams needs a Suspense boundary during prerendering.
    <Suspense fallback={null}>
      <SignInForm />
    </Suspense>
  );
}
