import { PageHeroSkeleton, TableSkeleton } from "@/components/page-hero-skeleton";

export default function PackagesLoading() {
  return (
    <div className="space-y-6">
      <PageHeroSkeleton statCount={3} />
      <TableSkeleton rows={6} />
    </div>
  );
}
