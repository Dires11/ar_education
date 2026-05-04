import { Skeleton } from "@/components/ui/skeleton";
import { TableSkeleton } from "@/components/page-hero-skeleton";

export default function StudentsLoading() {
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="space-y-1.5">
          <Skeleton className="h-7 w-32" />
          <Skeleton className="h-4 w-48" />
        </div>
        <Skeleton className="h-9 w-32" />
      </div>
      <div className="flex gap-2">
        <Skeleton className="h-9 flex-1 max-w-xs" />
        <Skeleton className="h-9 w-24" />
      </div>
      <TableSkeleton rows={10} />
    </div>
  );
}
