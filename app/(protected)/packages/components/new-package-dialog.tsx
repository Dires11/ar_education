"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { PlusIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { PackageForm } from "./package-form";
import { createPackageAction } from "@/app/actions/packages";
import type { CreatePackageInput } from "@/lib/validators/packages";

type Subject = { id: string; name: string };

export function NewPackageDialog({ subjects }: { subjects: Subject[] }) {
  const [open, setOpen] = useState(false);
  const router = useRouter();

  async function handleSubmit(values: CreatePackageInput) {
    const result = await createPackageAction(values);
    if (result.success) {
      toast.success("Package created");
      setOpen(false);
      router.refresh();
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button>
          <PlusIcon className="mr-2 h-4 w-4" />
          New Package
        </Button>
      </DialogTrigger>
      <DialogContent className="gap-3 p-5 sm:max-w-xl max-h-[90dvh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>New Package</DialogTitle>
        </DialogHeader>
        <PackageForm
          subjects={subjects}
          onSubmit={handleSubmit}
          onCancel={() => setOpen(false)}
          submitLabel="Create Package"
        />
      </DialogContent>
    </Dialog>
  );
}
