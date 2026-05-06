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
  lessonType: string;
  basePrice: string;
  subjectId: string | null;
};
type Group = {
  id: string;
  name: string;
  tutorId: string;
  subjectId: string;
  memberCount: number;
};

export function NewEnrollmentDialog({
  students,
  tutors,
  subjects,
  packages,
  groups,
}: {
  students: Student[];
  tutors: Tutor[];
  subjects: Subject[];
  packages: Package[];
  groups: Group[];
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
      <DialogContent className="sm:max-w-xl max-h-[90vh] overflow-y-auto">
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
