"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { PlusIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { NewEnrollmentForm } from "./new-enrollment-form";
import type {
  EnrollmentGroupOption,
  EnrollmentPackageOption,
  EnrollmentStudentOption,
  EnrollmentSubjectOption,
  EnrollmentTutorOption,
} from "./enrollment-form-types";

export function NewEnrollmentDialog({
  students,
  tutors,
  subjects,
  packages,
  groups,
}: {
  students: EnrollmentStudentOption[];
  tutors: EnrollmentTutorOption[];
  subjects: EnrollmentSubjectOption[];
  packages: EnrollmentPackageOption[];
  groups: EnrollmentGroupOption[];
}) {
  const [open, setOpen] = useState(false);
  const router = useRouter();

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button className="w-full justify-center sm:w-auto">
          <PlusIcon className="mr-2 h-4 w-4" />
          New Enrollment
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-xl max-h-[90dvh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>New Enrollment</DialogTitle>
        </DialogHeader>
        <NewEnrollmentForm
          students={students}
          tutors={tutors}
          subjects={subjects}
          packages={packages}
          groups={groups}
          onSuccess={() => {
            setOpen(false);
            router.refresh();
          }}
        />
      </DialogContent>
    </Dialog>
  );
}
