import { PageHeroSkeleton, TableSkeleton } from "@/components/page-hero-skeleton";

export default function TutorsLoading() {
  return (
    <div className="space-y-6">
      <PageHeroSkeleton statCount={3} />
      <TableSkeleton rows={8} />
    </div>
  );
}
