import { notFound } from "next/navigation";
import { getPackage } from "@/lib/data/packages";
import { listSubjects } from "@/lib/data/subjects";
import { EditPackageForm } from "../../components/edit-package-form";

export default async function EditPackagePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const [pkg, subjects] = await Promise.all([
    getPackage(id),
    listSubjects(),
  ]);

  if (!pkg) notFound();

  return (
    <div className="max-w-2xl space-y-4">
      <div>
        <h1 className="text-2xl font-semibold">Edit Package</h1>
        <p className="text-sm text-muted-foreground">{pkg.name}</p>
      </div>
      <EditPackageForm
        packageId={id}
        subjects={subjects}
        defaultValues={{
          name: pkg.name,
          type: pkg.type,
          billingPeriod: pkg.billingPeriod,
          lessonType: pkg.lessonType,
          subjectId: pkg.subjectId ?? "",
          basePrice: pkg.basePrice.toString(),
          sessionsPerWeek: pkg.sessionsPerWeek?.toString() ?? "",
          durationMinutes: pkg.durationMinutes.toString(),
        }}
      />
    </div>
  );
}
