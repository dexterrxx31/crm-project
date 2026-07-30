"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAction } from "next-safe-action/hooks";
import { useState } from "react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { signUpAction } from "@/lib/actions/auth";

export function SignUpForm() {
  const router = useRouter();
  const [formError, setFormError] = useState<string | null>(null);

  const { execute, isPending, result } = useAction(signUpAction, {
    onSuccess({ data }) {
      if (data?.ok) {
        setFormError(null);
        router.push("/dashboard");
        router.refresh();
      } else {
        setFormError(data?.message ?? "Could not create your account.");
      }
    },
    onError({ error }) {
      setFormError(error.serverError ?? "Could not create your account.");
    },
  });

  // next-safe-action v8 returns nested validation errors ({ field: { _errors } })
  // rather than the flattened shape from v7.
  const passwordError = result?.validationErrors?.password?._errors?.[0];

  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={(event) => {
        event.preventDefault();
        const data = new FormData(event.currentTarget);
        execute({
          name: String(data.get("name") ?? ""),
          email: String(data.get("email") ?? ""),
          password: String(data.get("password") ?? ""),
          organizationName: String(data.get("organizationName") ?? ""),
        });
      }}
    >
      {formError ? (
        <Alert variant="destructive">
          <AlertDescription>{formError}</AlertDescription>
        </Alert>
      ) : null}

      <div className="grid gap-2">
        <Label htmlFor="name">Your name</Label>
        <Input id="name" name="name" autoComplete="name" required />
      </div>

      <div className="grid gap-2">
        <Label htmlFor="organizationName">Organization</Label>
        <Input id="organizationName" name="organizationName" placeholder="Acme Sales" required />
        <p className="text-xs text-muted-foreground">
          Your workspace. Every record you create lives inside it.
        </p>
      </div>

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
          autoComplete="new-password"
          required
          minLength={8}
        />
        {passwordError ? (
          <p className="text-xs text-destructive">{passwordError}</p>
        ) : (
          <p className="text-xs text-muted-foreground">At least 8 characters.</p>
        )}
      </div>

      <Button type="submit" disabled={isPending} className="mt-2">
        {isPending ? "Creating your workspace…" : "Create account"}
      </Button>

      <p className="text-sm text-muted-foreground text-center">
        Already have an account?{" "}
        <Link href="/login" className="text-foreground underline underline-offset-4">
          Sign in
        </Link>
      </p>
    </form>
  );
}
