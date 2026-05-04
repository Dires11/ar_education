import { Skeleton } from "@/components/ui/skeleton";

export function PageHeroSkeleton({ statCount = 3 }: { statCount?: number }) {
  const cols =
    statCount <= 1
      ? "sm:grid-cols-1"
      : statCount === 2
        ? "sm:grid-cols-2"
        : statCount === 4
          ? "sm:grid-cols-4"
          : "sm:grid-cols-3";

  return (
    <section className="overflow-hidden rounded-3xl border bg-muted/30 px-6 py-6">
      <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
        <div className="space-y-4 flex-1">
          <Skeleton className="h-6 w-28 rounded-full" />
          <div className="space-y-2">
            <Skeleton className="h-9 w-48" />
            <Skeleton className="h-4 w-full max-w-lg" />
            <Skeleton className="h-4 w-3/4 max-w-md" />
          </div>
          <div className={`grid gap-3 ${cols}`}>
            {Array.from({ length: statCount }).map((_, i) => (
              <div
                key={i}
                className="rounded-2xl border bg-background/80 px-4 py-3"
              >
                <Skeleton className="h-3 w-20 mb-3" />
                <Skeleton className="h-7 w-12" />
              </div>
            ))}
          </div>
        </div>
        <Skeleton className="h-9 w-36 shrink-0" />
      </div>
    </section>
  );
}

export function TableSkeleton({ rows = 8 }: { rows?: number }) {
  return (
    <div className="rounded-lg border">
      <div className="border-b px-4 py-3">
        <div className="flex gap-4">
          {[40, 25, 20, 15].map((w, i) => (
            <Skeleton key={i} className="h-4" style={{ width: `${w}%` }} />
          ))}
        </div>
      </div>
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="border-b px-4 py-3 last:border-0">
          <div className="flex gap-4 items-center">
            <Skeleton className="h-4" style={{ width: "40%" }} />
            <Skeleton className="h-4" style={{ width: "25%" }} />
            <Skeleton className="h-4" style={{ width: "20%" }} />
            <Skeleton className="h-6 w-16 rounded-full ml-auto" />
          </div>
        </div>
      ))}
    </div>
  );
}
