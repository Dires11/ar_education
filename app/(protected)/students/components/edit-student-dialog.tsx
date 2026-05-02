"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { PencilIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { StudentEditForm } from "./student-edit-form";
import type { UpdateStudentFormValues } from "@/lib/validators/students";

export function EditStudentDialog({
  studentId,
  defaultValues,
  onSuccess,
  inline = false,
}: {
  studentId: string;
  defaultValues: UpdateStudentFormValues;
  onSuccess?: () => void;
  inline?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const router = useRouter();

  if (inline) {
    return (
      <div className="space-y-4">
        <div>
          <h3 className="text-sm font-medium">Edit Student</h3>
          <p className="text-xs text-muted-foreground">
            Update core student information and direct contact details.
          </p>
        </div>
        <StudentEditForm
          studentId={studentId}
          defaultValues={defaultValues}
          onSuccess={() => {
            onSuccess?.();
            router.refresh();
          }}
        />
      </div>
    );
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          <PencilIcon className="mr-2 h-3.5 w-3.5" />
          Edit
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Edit Student</DialogTitle>
          <DialogDescription>
            Update student information and contact details.
          </DialogDescription>
        </DialogHeader>
        <StudentEditForm
          studentId={studentId}
          defaultValues={defaultValues}
          onSuccess={() => {
            setOpen(false);
            onSuccess?.();
            router.refresh();
          }}
        />
      </DialogContent>
    </Dialog>
  );
}
