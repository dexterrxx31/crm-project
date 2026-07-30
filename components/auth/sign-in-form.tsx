"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useAction } from "next-safe-action/hooks";
import { useState } from "react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { signInAction } from "@/lib/actions/auth";

export function SignInForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [formError, setFormError] = useState<string | null>(null);

  const { execute, isPending } = useAction(signInAction, {
    onSuccess({ data }) {
      if (data?.ok) {
        setFormError(null);
        router.push(searchParams.get("next") ?? "/dashboard");
        // Refresh so server components pick up the new session cookie.
        router.refresh();
      } else {
        setFormError(data?.message ?? "Could not sign you in.");
      }
    },
    onError({ error }) {
      setFormError(error.serverError ?? "Could not sign you in.");
    },
  });

  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={(event) => {
        event.preventDefault();
        const data = new FormData(event.currentTarget);
        execute({
          email: String(data.get("email") ?? ""),
          password: String(data.get("password") ?? ""),
        });
      }}
    >
      {formError ? (
        <Alert variant="destructive">
          <AlertDescription>{formError}</AlertDescription>
        </Alert>
      ) : null}

      <div className="grid gap-2">
        <Label htmlFor="email">Email</Label>
        <Input id="email" name="email" type="email" autoComplete="email" required />
      </div>

      <div className="grid gap-2">
        <Label htmlFor="password">Password</Label>
        <Input
          id="password"
          name="password"
          type="password"
          autoComplete="current-password"
          required
        />
      </div>

      <Button type="submit" disabled={isPending} className="mt-2">
        {isPending ? "Signing in…" : "Sign in"}
      </Button>

      <p className="text-sm text-muted-foreground text-center">
        No account?{" "}
        <Link href="/signup" className="text-foreground underline underline-offset-4">
          Create one
        </Link>
      </p>
    </form>
  );
}
