"use client";

import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { createPackageAction } from "@/app/actions/packages";
import { PackageForm } from "./package-form";
import type { CreatePackageInput } from "@/lib/validators/packages";

type Subject = { id: string; name: string };

export function NewPackageForm({ subjects }: { subjects: Subject[] }) {
  const router = useRouter();

  async function handleSubmit(values: CreatePackageInput) {
    const result = await createPackageAction(values);
    if (result.success) {
      toast.success("Package created");
      router.push("/packages");
    }
  }

  return (
    <PackageForm
      subjects={subjects}
      onSubmit={handleSubmit}
      submitLabel="Create Package"
    />
  );
}
