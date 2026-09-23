"use client";

import { Menu } from "lucide-react";
import { useState } from "react";
import { AiChat } from "@/components/crm/ai-chat";
import { AppNav } from "@/components/crm/app-nav";
import { UserMenu } from "@/components/crm/user-menu";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";

/** Drawer version of the sidebar, for viewports below the `md` breakpoint. */
export function MobileNav({
  organizationName,
  userName,
  userEmail,
}: {
  organizationName: string;
  userName: string;
  userEmail: string;
}) {
  const [open, setOpen] = useState(false);

  return (
    <header className="flex items-center justify-between border-b p-3 md:hidden">
      <div className="min-w-0">
        <p className="text-sm font-semibold tracking-tight">Synapse CRM</p>
        <p className="truncate text-xs text-muted-foreground">{organizationName}</p>
      </div>

      <Sheet open={open} onOpenChange={setOpen}>
        <SheetTrigger asChild>
          <Button variant="outline" size="icon" aria-label="Open menu">
            <Menu className="size-4" aria-hidden="true" />
          </Button>
        </SheetTrigger>
        <SheetContent side="left" className="flex w-72 flex-col justify-between">
          <SheetHeader>
            <SheetTitle>Synapse CRM</SheetTitle>
          </SheetHeader>
          <div className="flex-1 px-1">
            <AppNav onNavigate={() => setOpen(false)} />
          </div>
          <div className="flex flex-col gap-3 border-t p-3">
            {/* Ask Synapse opens its own Sheet — close this drawer's so the two
            overlays don't stack. */}
            <AiChat onOpenChange={(chatOpen) => chatOpen && setOpen(false)} />
            <UserMenu name={userName} email={userEmail} organizationName={organizationName} />
          </div>
        </SheetContent>
      </Sheet>
    </header>
  );
}
