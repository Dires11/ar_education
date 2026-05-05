"use client";

import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { updateEnrollmentAction } from "@/app/actions/enrollments";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { EnrollmentStatus } from "@/generated/prisma";

export function EnrollmentStatusSelect({
  enrollmentId,
  studentId,
  currentStatus,
  onUpdated,
}: {
  enrollmentId: string;
  studentId: string;
  currentStatus: EnrollmentStatus;
  onUpdated?: () => void | Promise<void>;
}) {
  const router = useRouter();

  async function handleChange(status: string) {
    try {
      await updateEnrollmentAction(enrollmentId, studentId, {
        status: status as EnrollmentStatus,
      });
      toast.success("Status updated");
      await onUpdated?.();
      router.refresh();
    } catch {
      toast.error("Failed to update status");
    }
  }

  return (
    <Select defaultValue={currentStatus} onValueChange={handleChange}>
      <SelectTrigger className="w-36">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="ACTIVE">Active</SelectItem>
        <SelectItem value="PAUSED">Paused</SelectItem>
        <SelectItem value="COMPLETED">Completed</SelectItem>
        <SelectItem value="CANCELLED">Cancelled</SelectItem>
      </SelectContent>
    </Select>
  );
}
