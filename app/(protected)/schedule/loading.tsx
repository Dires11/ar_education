import { Skeleton } from "@/components/ui/skeleton";
import { PageHeroSkeleton } from "@/components/page-hero-skeleton";

const DAY_HEADERS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

export default function ScheduleLoading() {
  // 5-week grid = 35 cells, mirrors the most common month layout
  const cells = Array.from({ length: 35 });

  // Scatter a few skeleton pills to mimic a real month with sessions
  const pillPattern: Record<number, number> = {
    2: 1,
    5: 2,
    8: 1,
    9: 1,
    12: 3,
    15: 1,
    16: 2,
    19: 1,
    22: 2,
    26: 1,
    29: 2,
    33: 1,
  };

  return (
    <div className="space-y-6">
      <PageHeroSkeleton statCount={4} />

      {/* Same two-column layout as MonthCalendar */}
      <div className="grid gap-4 min-w-0 lg:grid-cols-[minmax(0,1fr)_20rem]">
        {/* Calendar card */}
        <div className="min-w-0 overflow-hidden rounded-2xl border bg-card shadow-sm">
          {/* Nav bar */}
          <div className="flex items-center justify-between border-b bg-muted/30 px-4 py-3">
            <div className="space-y-1.5">
              <Skeleton className="h-4 w-28" />
              <Skeleton className="h-3 w-40" />
            </div>
            <div className="flex items-center gap-1">
              <Skeleton className="h-8 w-8 rounded-md" />
              <Skeleton className="h-8 w-14 rounded-md" />
              <Skeleton className="h-8 w-8 rounded-md" />
            </div>
          </div>

          {/* Day-of-week headers */}
          <div className="grid grid-cols-7 border-b bg-background">
            {DAY_HEADERS.map((d) => (
              <div
                key={d}
                className="px-2 py-2 text-center text-xs font-medium text-muted-foreground"
              >
                {d}
              </div>
            ))}
          </div>

          {/* Day cells */}
          <div className="grid grid-cols-7">
            {cells.map((_, i) => {
              const pillCount = pillPattern[i] ?? 0;
              return (
                <div
                  key={i}
                  className="min-h-[112px] border-b border-r p-2 last:border-b-0 [&:nth-child(7n)]:border-r-0"
                >
                  {/* Date number circle */}
                  <Skeleton className="h-6 w-6 rounded-full mb-1.5" />
                  {/* Session pills */}
                  <div className="space-y-0.5">
                    {Array.from({ length: pillCount }).map((_, j) => (
                      <Skeleton
                        key={j}
                        className="h-[18px] w-full rounded-sm"
                      />
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Sidebar panel — matches the "Select a day" idle state */}
        <div className="min-w-0">
          <div className="sticky top-4 overflow-hidden rounded-2xl border bg-card shadow-sm p-6 text-center">
            <Skeleton className="h-4 w-24 mx-auto mb-2" />
            <Skeleton className="h-3 w-44 mx-auto" />
          </div>
        </div>
      </div>
    </div>
  );
}
