"use client";

import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { updatePackageAction } from "@/app/actions/packages";
import { PackageForm } from "./package-form";
import type { CreatePackageInput } from "@/lib/validators/packages";

type Subject = { id: string; name: string };

export function EditPackageForm({
  packageId,
  subjects,
  defaultValues,
}: {
  packageId: string;
  subjects: Subject[];
  defaultValues: CreatePackageInput;
}) {
  const router = useRouter();

  async function handleSubmit(values: CreatePackageInput) {
    await updatePackageAction(packageId, values);
    toast.success("Package updated");
    router.push("/packages");
  }

  return (
    <PackageForm
      subjects={subjects}
      defaultValues={defaultValues}
      onSubmit={handleSubmit}
      submitLabel="Save Changes"
    />
  );
}
