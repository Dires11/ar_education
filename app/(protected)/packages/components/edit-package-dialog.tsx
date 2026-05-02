"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { PencilIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { PackageForm } from "./package-form";
import { updatePackageAction } from "@/app/actions/packages";
import type { CreatePackageInput } from "@/lib/validators/packages";

type Subject = { id: string; name: string };

export function EditPackageDialog({
  packageId,
  subjects,
  defaultValues,
}: {
  packageId: string;
  subjects: Subject[];
  defaultValues: CreatePackageInput;
}) {
  const [open, setOpen] = useState(false);
  const router = useRouter();

  async function handleSubmit(values: CreatePackageInput) {
    await updatePackageAction(packageId, values);
    toast.success("Package updated");
    setOpen(false);
    router.refresh();
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="ghost" size="icon" className="h-7 w-7">
          <PencilIcon className="h-3.5 w-3.5" />
        </Button>
      </DialogTrigger>
      <DialogContent className="gap-3 p-5 sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>Edit Package</DialogTitle>
        </DialogHeader>
        <PackageForm
          subjects={subjects}
          defaultValues={defaultValues}
          onSubmit={handleSubmit}
          onCancel={() => setOpen(false)}
          submitLabel="Save Changes"
        />
      </DialogContent>
    </Dialog>
  );
}
