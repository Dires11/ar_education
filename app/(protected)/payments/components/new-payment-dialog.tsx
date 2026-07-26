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
import { NewPaymentForm } from "./new-payment-form";
import type {
  PaymentEnrollmentOption,
  PaymentStudentOption,
} from "./payment-form-types";

export function NewPaymentDialog({
  students,
  enrollments,
  defaultStudentId,
  defaultPaidAt,
}: {
  students: PaymentStudentOption[];
  enrollments: PaymentEnrollmentOption[];
  defaultStudentId?: string;
  defaultPaidAt: string;
}) {
  const [open, setOpen] = useState(false);
  const router = useRouter();

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button>
          <PlusIcon className="mr-2 h-4 w-4" />
          Record Payment
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-xl max-h-[90dvh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Record Payment</DialogTitle>
        </DialogHeader>
        <NewPaymentForm
          students={students}
          enrollments={enrollments}
          defaultStudentId={defaultStudentId}
          defaultPaidAt={defaultPaidAt}
          onSuccess={() => {
            setOpen(false);
            router.refresh();
          }}
        />
      </DialogContent>
    </Dialog>
  );
}
