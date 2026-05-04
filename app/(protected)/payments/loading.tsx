import { Skeleton } from "@/components/ui/skeleton";
import { PageHeroSkeleton } from "@/components/page-hero-skeleton";

export default function PaymentsLoading() {
  return (
    <div className="space-y-6">
      <PageHeroSkeleton statCount={4} />

      {/* Tabs bar */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex gap-1 rounded-lg border bg-muted p-1 h-9">
          <Skeleton className="h-7 w-32 rounded-md" />
          <Skeleton className="h-7 w-24 rounded-md" />
        </div>
      </div>

      {/* Table */}
      <div className="rounded-xl border overflow-hidden">
        <div className="bg-muted/40 px-4 py-2.5 border-b">
          <div className="flex gap-6">
            {[12, 18, 10, 12, 22, 10, 16].map((w, i) => (
              <Skeleton key={i} className="h-3.5" style={{ width: `${w * 4}px` }} />
            ))}
          </div>
        </div>
        {Array.from({ length: 10 }).map((_, i) => (
          <div key={i} className="flex items-center gap-6 border-b last:border-0 px-4 py-3">
            <Skeleton className="h-4 w-20" />
            <Skeleton className="h-4 w-32" />
            <Skeleton className="h-4 w-16" />
            <Skeleton className="h-5 w-20 rounded-full" />
            <Skeleton className="h-4 w-40" />
            <Skeleton className="h-4 w-16" />
            <Skeleton className="h-4 w-24" />
          </div>
        ))}
      </div>
    </div>
  );
}
