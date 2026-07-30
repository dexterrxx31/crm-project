"use client";

import { LogOut } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { authClient } from "@/lib/auth-client";

export function UserMenu({
  name,
  email,
  organizationName,
}: {
  name: string;
  email: string;
  organizationName: string;
}) {
  const router = useRouter();
  const [signingOut, setSigningOut] = useState(false);

  return (
    <div className="flex flex-col gap-2 border-t pt-3">
      <div className="px-1">
        <p className="truncate text-sm font-medium">{name}</p>
        <p className="truncate text-xs text-muted-foreground">{email}</p>
        <p className="mt-1 truncate text-xs text-muted-foreground">{organizationName}</p>
      </div>
      <Button
        variant="ghost"
        size="sm"
        className="justify-start gap-2 text-muted-foreground"
        disabled={signingOut}
        onClick={async () => {
          setSigningOut(true);
          await authClient.signOut();
          router.push("/login");
          router.refresh();
        }}
      >
        <LogOut className="size-4" aria-hidden="true" />
        {signingOut ? "Signing out…" : "Sign out"}
      </Button>
    </div>
  );
}
