import { Skeleton } from "@/components/ui/skeleton";

export default function AssistantLoading() {
  return (
    <div className="grid min-h-[calc(100vh-7rem)] gap-4 lg:grid-cols-[18rem_1fr]">
      <Skeleton className="hidden rounded-xl lg:block" />
      <div className="flex min-h-0 flex-col gap-4 rounded-xl border p-4">
        <Skeleton className="h-10 w-56" />
        <Skeleton className="flex-1" />
        <Skeleton className="h-24" />
      </div>
    </div>
  );
}
