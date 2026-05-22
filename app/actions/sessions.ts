"use server";

import { revalidatePath } from "next/cache";
import { format, startOfMonth, parse } from "date-fns";
import { requireAdmin } from "@/lib/utils/auth";
import {
  createAdHocSession,
  createRecurringSchedule,
  markSessionAttendance,
  cancelSessionById,
  deleteSessionById,
  getEnrollmentMonthSummary,
  getRecurringSchedulePreview,
  getMonthSchedule,
  splitRecurrenceRule,
  endRecurrenceFromDate,
  cancelVirtualOccurrence,
  rescheduleVirtualOccurrence,
  autoCompletePassedSessions,
  deleteRecurringSchedule,
  updateEnrollmentRecurrenceColor,
} from "@/lib/services/sessions";
import {
  updateSession,
  updateSessionStatus,
  getActiveRecurrenceRulesForEnrollment,
  getActiveRecurrenceRulesForGroup,
} from "@/lib/data/sessions";
import { enqueueSessionReminder } from "@/lib/services/notifications";
import type {
  CreateAdHocSessionInput,
  CreateRecurrenceInput,
  MarkAttendanceInput,
} from "@/lib/validators/sessions";

function friendlyScheduleError(error: unknown): Error {
  if (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    error.code === "P2002"
  ) {
    const target = "meta" in error &&
      typeof error.meta === "object" &&
      error.meta !== null &&
      "target" in error.meta
        ? error.meta.target
        : null;

    if (
      Array.isArray(target) &&
      target.includes("sessionId") &&
      target.includes("studentId")
    ) {
      return new Error("That student is already on this session's attendance list.");
    }

    return new Error("This schedule item already exists.");
  }

  return error instanceof Error ? error : new Error("Something went wrong. Please try again.");
}

export async function createAdHocSessionAction(input: CreateAdHocSessionInput) {
  await requireAdmin();
  try {
    const session = await createAdHocSession(input);
    enqueueSessionReminder(session.id).catch(console.error);
    revalidatePath("/schedule");
    return { success: true, id: session.id };
  } catch (error) {
    throw friendlyScheduleError(error);
  }
}

export async function createRecurringScheduleAction(
  input: CreateRecurrenceInput
) {
  await requireAdmin();
  try {
    const result = await createRecurringSchedule(input);
    revalidatePath("/schedule");
    return {
      success: true,
      rulesCreated: result.rulesCreated,
      materializedSessions: result.materializedSessions,
      preview: result.preview,
    };
  } catch (error) {
    throw friendlyScheduleError(error);
  }
}

export async function markAttendanceAction(
  sessionId: string,
  input: MarkAttendanceInput
) {
  await requireAdmin();
  await markSessionAttendance(sessionId, input);
  revalidatePath("/schedule");
  revalidatePath(`/schedule/${sessionId}`);
  return { success: true };
}

export async function setSessionStatusAction(
  sessionId: string,
  status: "SCHEDULED" | "COMPLETED" | "NO_SHOW" | "CANCELLED_BY_TUTOR" | "CANCELLED_BY_STUDENT"
) {
  await requireAdmin();
  await updateSessionStatus(sessionId, status);
  revalidatePath("/schedule");
  return { success: true };
}

export async function cancelSessionAction(
  sessionId: string,
  cancelledBy: "TUTOR" | "STUDENT"
) {
  await requireAdmin();
  await cancelSessionById(sessionId, cancelledBy);
  revalidatePath("/schedule");
  revalidatePath(`/schedule/${sessionId}`);
  return { success: true };
}

export async function deleteSessionAction(sessionId: string) {
  await requireAdmin();
  await deleteSessionById(sessionId);
  revalidatePath("/schedule");
  return { success: true };
}

export async function updateSessionAction(
  sessionId: string,
  data: {
    scheduledFor?: string;
    durationMinutes?: number;
    room?: string | null;
    notes?: string | null;
  }
) {
  await requireAdmin();
  await updateSession(sessionId, {
    scheduledFor: data.scheduledFor ? new Date(data.scheduledFor) : undefined,
    durationMinutes: data.durationMinutes,
    room: data.room ?? null,
    notes: data.notes ?? null,
  });
  revalidatePath("/schedule");
  return { success: true };
}

export async function splitRecurrenceRuleAction(
  ruleId: string,
  splitDateStr: string,
  newParams: {
    startTime?: string;
    durationMinutes?: number;
    room?: string | null;
    intervalWeeks?: number;
    dayOfWeek?: number;
  }
) {
  await requireAdmin();
  await splitRecurrenceRule(ruleId, new Date(splitDateStr), newParams);
  revalidatePath("/schedule");
  return { success: true };
}

export async function endRecurrenceRuleAction(ruleId: string, fromDateStr: string) {
  await requireAdmin();
  await endRecurrenceFromDate(ruleId, new Date(fromDateStr));
  revalidatePath("/schedule");
  return { success: true };
}

export async function cancelOccurrenceAction(ruleId: string, dateStr: string) {
  await requireAdmin();
  await cancelVirtualOccurrence(ruleId, new Date(dateStr));
  revalidatePath("/schedule");
  return { success: true };
}

export async function rescheduleOccurrenceAction(
  ruleId: string,
  newScheduledForStr: string,
  overrides: { durationMinutes?: number; room?: string | null }
) {
  await requireAdmin();
  await rescheduleVirtualOccurrence(ruleId, new Date(newScheduledForStr), overrides);
  revalidatePath("/schedule");
  return { success: true };
}

export async function deleteRecurrenceRuleAction(ruleId: string) {
  await requireAdmin();
  await deleteRecurringSchedule(ruleId);
  revalidatePath("/schedule");
  return { success: true };
}

export async function getEnrollmentMonthSummaryAction(
  enrollmentId: string,
  dateStr: string
) {
  await requireAdmin();
  return getEnrollmentMonthSummary(enrollmentId, new Date(dateStr));
}

export async function getRecurringSchedulePreviewAction(
  input: CreateRecurrenceInput
) {
  await requireAdmin();
  return getRecurringSchedulePreview(input);
}

// ─── Comprehensive month fetch used by client-side navigation ─────────────────

export async function fetchScheduleForMonth(monthParam: string) {
  await requireAdmin();

  const monthStart = startOfMonth(parse(monthParam, "yyyy-MM-dd", new Date()));
  autoCompletePassedSessions().catch(() => {});

  const { realSessions, virtualSessions, paidMonths } = await getMonthSchedule(monthStart);

  const sessions = realSessions.map((s) => ({
    id: s.id,
    scheduledFor: s.scheduledFor.toISOString(),
    durationMinutes: s.durationMinutes,
    status: s.status as string,
    room: s.room,
    notes: s.notes,
    tutor: { firstName: s.tutor.firstName, lastName: s.tutor.lastName },
    subject: { name: s.subject.name },
    enrollmentStudent: s.enrollment?.student
      ? {
          firstName: s.enrollment.student.firstName,
          lastName: s.enrollment.student.lastName,
        }
      : null,
    attendance: s.attendance.map((a) => ({
      studentId: a.studentId,
      status: a.status,
      billable: a.billable,
      student: { firstName: a.student.firstName, lastName: a.student.lastName },
    })),
    enrollmentId: s.enrollmentId,
    groupId: s.recurrenceRule?.groupId ?? null,
    groupName: s.recurrenceRule?.group?.name ?? null,
    recurrenceRuleId: s.recurrenceRuleId,
    virtual: false as const,
    ruleId: s.recurrenceRuleId,
    startTime: s.recurrenceRule?.startTime ?? null,
    dayOfWeek: s.recurrenceRule?.dayOfWeek ?? null,
    intervalWeeks: s.recurrenceRule?.intervalWeeks ?? null,
    color: s.recurrenceRule?.color ?? null,
    isPaid: s.enrollmentId
      ? paidMonths.has(`${s.enrollmentId}:${format(s.scheduledFor, "yyyy-MM")}`)
      : null as boolean | null,
  }));

  const virtual = virtualSessions.map((v) => ({
    ...v,
    notes: null as string | null,
    recurrenceRuleId: null as string | null,
    isPaid: v.enrollmentId ? paidMonths.has(`${v.enrollmentId}:${format(new Date(v.scheduledFor), "yyyy-MM")}`) : null,
  }));

  return { sessions, virtual };
}

export async function getActiveRecurrenceRulesAction(enrollmentId: string) {
  await requireAdmin();
  return getActiveRecurrenceRulesForEnrollment(enrollmentId);
}

export async function updateEnrollmentRecurrenceColorAction(
  enrollmentId: string,
  color: string
) {
  await requireAdmin();
  await updateEnrollmentRecurrenceColor(enrollmentId, color);
  revalidatePath("/schedule");
  return { success: true };
}

export async function getActiveRecurrenceRulesForGroupAction(groupId: string) {
  await requireAdmin();
  return getActiveRecurrenceRulesForGroup(groupId);
}
