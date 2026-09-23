import { Skeleton } from "@/components/ui/skeleton";

/** Generic shape shared by every (app) page: a header, then content. */
export default function Loading() {
  return (
    <>
      <header className="flex items-center justify-between gap-3 border-b px-6 py-5">
        <div className="flex flex-col gap-2">
          <Skeleton className="h-6 w-40" />
          <Skeleton className="h-4 w-64" />
        </div>
        <Skeleton className="h-9 w-28" />
      </header>
      <div className="flex flex-col gap-3 p-6">
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-10 w-3/4" />
      </div>
    </>
  );
}
