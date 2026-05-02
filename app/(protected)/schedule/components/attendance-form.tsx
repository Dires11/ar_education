"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { markAttendanceAction } from "@/app/actions/sessions";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";

type AttendanceEntry = {
  studentId: string;
  studentName: string;
  status: string;
  billable: boolean;
};

const BILLABLE_STATUSES = ["COMPLETED"];

export function AttendanceForm({
  sessionId,
  isEditable,
  attendances: initial,
}: {
  sessionId: string;
  isEditable: boolean;
  attendances: AttendanceEntry[];
}) {
  const router = useRouter();
  const [attendances, setAttendances] = useState(initial);
  const [saving, setSaving] = useState(false);

  function updateStatus(studentId: string, status: string) {
    setAttendances((prev) =>
      prev.map((a) =>
        a.studentId === studentId
          ? {
              ...a,
              status,
              billable: BILLABLE_STATUSES.includes(status),
            }
          : a
      )
    );
  }

  function updateBillable(studentId: string, billable: boolean) {
    setAttendances((prev) =>
      prev.map((a) =>
        a.studentId === studentId ? { ...a, billable } : a
      )
    );
  }

  async function handleSave() {
    setSaving(true);
    try {
      await markAttendanceAction(sessionId, {
        attendances: attendances.map((a) => ({
          studentId: a.studentId,
          status: a.status as
            | "COMPLETED"
            | "NO_SHOW"
            | "CANCELLED_BY_TUTOR"
            | "CANCELLED_BY_STUDENT",
          billable: a.billable,
        })),
      });
      toast.success("Attendance saved");
      router.refresh();
    } catch {
      toast.error("Failed to save attendance");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-3">
      {attendances.map((attendance) => (
        <div
          key={attendance.studentId}
          className="flex items-center gap-4 rounded-md border px-4 py-3"
        >
          <span className="text-sm font-medium flex-1">
            {attendance.studentName}
          </span>
          {isEditable ? (
            <>
              <Select
                value={attendance.status}
                onValueChange={(v) => updateStatus(attendance.studentId, v)}
              >
                <SelectTrigger className="w-48">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="SCHEDULED">Scheduled</SelectItem>
                  <SelectItem value="COMPLETED">Completed</SelectItem>
                  <SelectItem value="NO_SHOW">No Show</SelectItem>
                  <SelectItem value="CANCELLED_BY_TUTOR">
                    Cancelled by Tutor
                  </SelectItem>
                  <SelectItem value="CANCELLED_BY_STUDENT">
                    Cancelled by Student
                  </SelectItem>
                </SelectContent>
              </Select>
              <div className="flex items-center gap-2">
                <Checkbox
                  id={`billable-${attendance.studentId}`}
                  checked={attendance.billable}
                  onCheckedChange={(checked) =>
                    updateBillable(attendance.studentId, !!checked)
                  }
                />
                <Label
                  htmlFor={`billable-${attendance.studentId}`}
                  className="text-sm cursor-pointer"
                >
                  Billable
                </Label>
              </div>
            </>
          ) : (
            <>
              <span className="text-sm text-muted-foreground">
                {attendance.status.replace(/_/g, " ")}
              </span>
              {attendance.billable && (
                <span className="text-xs bg-green-100 text-green-800 rounded-full px-2 py-0.5">
                  Billable
                </span>
              )}
            </>
          )}
        </div>
      ))}

      {isEditable && (
        <Button onClick={handleSave} disabled={saving}>
          {saving ? "Saving..." : "Save Attendance"}
        </Button>
      )}
    </div>
  );
}
