"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { PlusIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { NewSessionForm } from "./new-session-form";

type Tutor = { id: string; name: string; subjectIds: string[] };
type Subject = { id: string; name: string };
type Enrollment = {
  id: string;
  label: string;
  studentId: string;
  tutorId: string;
  subjectId: string;
  sessionsPerWeek?: number | null;
  packageName?: string | null;
};

export function NewSessionDialog({
  tutors,
  subjects,
  enrollments,
  defaultDate,
  onSuccess,
}: {
  tutors: Tutor[];
  subjects: Subject[];
  enrollments: Enrollment[];
  defaultDate?: Date;
  onSuccess?: () => void;
}) {
  const [open, setOpen] = useState(false);
  const router = useRouter();

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button>
          <PlusIcon className="mr-2 h-4 w-4" />
          New Session
        </Button>
      </DialogTrigger>
      <DialogContent className="overflow-hidden p-0 sm:max-w-xl">
        <DialogHeader className="sr-only">
          <DialogTitle>New Session</DialogTitle>
          <DialogDescription>
            Schedule a one-time or recurring tutoring session.
          </DialogDescription>
        </DialogHeader>
        <NewSessionForm
          tutors={tutors}
          subjects={subjects}
          enrollments={enrollments}
          defaultDate={defaultDate}
          onSuccess={() => {
            setOpen(false);
            if (onSuccess) {
              onSuccess();
            } else {
              router.refresh();
            }
          }}
        />
      </DialogContent>
    </Dialog>
  );
}
