import { listSubjects } from "@/lib/data/subjects";
import { NewPackageForm } from "../components/new-package-form";

export default async function NewPackagePage() {
  const subjects = await listSubjects();

  return (
    <div className="max-w-2xl space-y-4">
      <div>
        <h1 className="text-2xl font-semibold">New Package</h1>
        <p className="text-sm text-muted-foreground">
          Define a pricing package for students
        </p>
      </div>
      <NewPackageForm subjects={subjects} />
    </div>
  );
}
