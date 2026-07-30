import { redirect } from "next/navigation";
import { PosthogIdentify } from "@/components/analytics/posthog-identify";
import { AiChat } from "@/components/crm/ai-chat";
import { AppNav } from "@/components/crm/app-nav";
import { UserMenu } from "@/components/crm/user-menu";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { getOrgContext } from "@/lib/auth-context";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  // The real gate. `proxy.ts` only does an optimistic cookie check; this is the
  // check that actually resolves the session and its organization.
  const context = await getOrgContext();
  if (!context) redirect("/login");

  return (
    <TooltipProvider>
      <PosthogIdentify
        userId={context.userId}
        userEmail={context.userEmail}
        organizationId={context.organizationId}
        organizationName={context.organizationName}
      />
      <div className="flex flex-1">
        <aside className="hidden w-60 shrink-0 flex-col justify-between border-r bg-sidebar p-3 md:flex">
          <div>
            <div className="mb-5 px-2 pt-1">
              <p className="text-sm font-semibold tracking-tight">Synapse CRM</p>
              <p className="truncate text-xs text-muted-foreground">{context.organizationName}</p>
            </div>
            <AppNav />
          </div>
          <div className="flex flex-col gap-3">
            <AiChat />
            <UserMenu
              name={context.userName}
              email={context.userEmail}
              organizationName={context.organizationName}
            />
          </div>
        </aside>

        <main className="flex min-w-0 flex-1 flex-col">{children}</main>
      </div>
      <Toaster />
    </TooltipProvider>
  );
}
