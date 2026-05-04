import { PageHeroSkeleton, TableSkeleton } from "@/components/page-hero-skeleton";

export default function SubjectsLoading() {
  return (
    <div className="space-y-6">
      <PageHeroSkeleton statCount={2} />
      <TableSkeleton rows={6} />
    </div>
  );
}
