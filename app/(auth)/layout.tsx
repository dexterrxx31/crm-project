export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex flex-1 items-center justify-center px-4 py-12">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <h1 className="text-2xl font-semibold tracking-tight">Synapse CRM</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Accounts, contacts, deals — and an agent that knows them.
          </p>
        </div>
        {children}
      </div>
    </div>
  );
}
