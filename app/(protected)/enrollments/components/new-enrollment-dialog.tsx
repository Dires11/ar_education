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

type Student = { id: string; name: string };
type Tutor = { id: string; name: string; subjectIds: string[] };
type Subject = { id: string; name: string };
type Package = {
  id: string;
  name: string;
  type: string;
  basePrice: string;
  subjectId: string | null;
};

export function NewEnrollmentDialog({
  students,
  tutors,
  subjects,
  packages,
}: {
  students: Student[];
  tutors: Tutor[];
  subjects: Subject[];
  packages: Package[];
}) {
  const [open, setOpen] = useState(false);
  const router = useRouter();

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button>
          <PlusIcon className="mr-2 h-4 w-4" />
          New Enrollment
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>New Enrollment</DialogTitle>
        </DialogHeader>
        <NewEnrollmentForm
          students={students}
          tutors={tutors}
          subjects={subjects}
          packages={packages}
          onSuccess={() => {
            setOpen(false);
            router.refresh();
          }}
        />
      </DialogContent>
    </Dialog>
  );
}
