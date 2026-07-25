"use client";

import { format } from "date-fns";
import { ClockIcon, GraduationCapIcon } from "lucide-react";
import { AttendanceForm } from "./attendance-form";
import type { CalendarSession } from "./calendar-session";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

function statusLabel(session: CalendarSession) {
  if (session.status === "VIRTUAL_UPCOMING") return "Upcoming";
  if (session.status === "VIRTUAL_DEPLETED") return "Limit reached";
  return session.status.replace(/_/g, " ").toLowerCase();
}

export function SessionDetailsDialog({
  session,
  open,
  onOpenChange,
  onRefresh,
}: {
  session: CalendarSession | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onRefresh: () => void;
}) {
  if (!session) return null;

  const scheduledFor = new Date(session.scheduledFor);
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg max-h-[90dvh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{session.subject.name}</DialogTitle>
          <DialogDescription>
            {format(scheduledFor, "EEEE, MMMM d, yyyy 'at' h:mm a")}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="outline" className="rounded-full capitalize">
              {statusLabel(session)}
            </Badge>
            {session.virtual && (
              <Badge variant="outline" className="rounded-full border-dashed">
                Virtual
              </Badge>
            )}
            {session.isPaid === false && (
              <Badge className="rounded-full bg-amber-100 text-amber-800">
                Unpaid
              </Badge>
            )}
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="rounded-lg border bg-muted/30 p-3">
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <ClockIcon className="h-3.5 w-3.5" />
                Duration
              </div>
              <p className="mt-1 text-sm font-medium">
                {session.durationMinutes} minutes
              </p>
            </div>
            <div className="rounded-lg border bg-muted/30 p-3">
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <GraduationCapIcon className="h-3.5 w-3.5" />
                Tutor
              </div>
              <p className="mt-1 text-sm font-medium">
                {session.tutor.firstName} {session.tutor.lastName}
              </p>
            </div>
          </div>

          {!session.virtual && session.attendance.length > 0 && (
            <div className="rounded-lg border p-3">
              <p className="mb-3 text-xs text-muted-foreground">Attendance</p>
              <AttendanceForm
                sessionId={session.id}
                isEditable
                attendances={session.attendance
                  .map((attendance) => ({
                    studentId: attendance.studentId ?? "",
                    studentName: `${attendance.student.firstName} ${attendance.student.lastName}`,
                    status: attendance.status ?? session.status,
                    billable: attendance.billable ?? false,
                  }))
                  .filter((attendance) => attendance.studentId)}
                onSaved={onRefresh}
              />
            </div>
          )}

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="rounded-lg border p-3">
              <p className="text-xs text-muted-foreground">Room</p>
              <p className="mt-1 text-sm font-medium">{session.room || "—"}</p>
            </div>
            <div className="rounded-lg border p-3">
              <p className="text-xs text-muted-foreground">Schedule Type</p>
              <p className="mt-1 text-sm font-medium">
                {session.ruleId ? "Recurring" : "One-time"}
              </p>
            </div>
          </div>

          {session.notes && (
            <div className="rounded-lg border p-3">
              <p className="text-xs text-muted-foreground">Notes</p>
              <p className="mt-1 text-sm">{session.notes}</p>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
