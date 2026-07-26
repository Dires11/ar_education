"use server";

import { revalidatePath } from "next/cache";
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
  deleteRecurringSchedule,
  updateEnrollmentRecurrenceColor,
  updateScheduledSession,
  updateSessionStatus,
  getActiveRecurrenceRulesForEnrollment,
  getActiveRecurrenceRulesForGroup,
} from "@/lib/services/sessions";
import type {
  CreateAdHocSessionInput,
  CreateRecurrenceInput,
  MarkAttendanceInput,
} from "@/lib/validators/sessions";
import {
  recurrenceOccurrenceSchema,
  rescheduleOccurrenceSchema,
  splitRecurrenceSchema,
  updateSessionSchema,
} from "@/lib/validators/sessions";
import {
  idSchema,
  isoDateTimeSchema,
  monthSchema,
} from "@/lib/validators/common";
import {
  getCalendarMonthKey,
  getConfiguredCenterTimeZone,
} from "@/lib/services/session-dates";
import { z } from "zod";

const sessionStatusSchema = z.enum([
  "SCHEDULED",
  "COMPLETED",
  "NO_SHOW",
  "CANCELLED_BY_TUTOR",
  "CANCELLED_BY_STUDENT",
]);

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
  sessionId = idSchema.parse(sessionId);
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
  await updateSessionStatus(
    idSchema.parse(sessionId),
    sessionStatusSchema.parse(status),
  );
  revalidatePath("/schedule");
  return { success: true };
}

export async function cancelSessionAction(
  sessionId: string,
  cancelledBy: "TUTOR" | "STUDENT"
) {
  await requireAdmin();
  await cancelSessionById(
    idSchema.parse(sessionId),
    z.enum(["TUTOR", "STUDENT"]).parse(cancelledBy),
  );
  revalidatePath("/schedule");
  revalidatePath(`/schedule/${sessionId}`);
  return { success: true };
}

export async function deleteSessionAction(sessionId: string) {
  await requireAdmin();
  await deleteSessionById(idSchema.parse(sessionId));
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
  const parsed = updateSessionSchema.parse(data);
  await updateScheduledSession(idSchema.parse(sessionId), {
    scheduledFor: parsed.scheduledFor
      ? new Date(parsed.scheduledFor)
      : undefined,
    durationMinutes: parsed.durationMinutes,
    room: parsed.room,
    notes: parsed.notes,
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
  const parsed = splitRecurrenceSchema.parse({
    ruleId,
    splitDate: splitDateStr,
    params: newParams,
  });
  await splitRecurrenceRule(
    parsed.ruleId,
    new Date(parsed.splitDate),
    parsed.params,
  );
  revalidatePath("/schedule");
  return { success: true };
}

export async function endRecurrenceRuleAction(ruleId: string, fromDateStr: string) {
  await requireAdmin();
  const parsed = recurrenceOccurrenceSchema.parse({
    ruleId,
    occurrenceFor: fromDateStr,
  });
  await endRecurrenceFromDate(parsed.ruleId, new Date(parsed.occurrenceFor));
  revalidatePath("/schedule");
  return { success: true };
}

export async function cancelOccurrenceAction(ruleId: string, dateStr: string) {
  await requireAdmin();
  const parsed = recurrenceOccurrenceSchema.parse({
    ruleId,
    occurrenceFor: dateStr,
  });
  await cancelVirtualOccurrence(
    parsed.ruleId,
    new Date(parsed.occurrenceFor),
  );
  revalidatePath("/schedule");
  return { success: true };
}

export async function rescheduleOccurrenceAction(
  ruleId: string,
  originalScheduledForStr: string,
  newScheduledForStr: string,
  overrides: { durationMinutes?: number; room?: string | null }
) {
  await requireAdmin();
  const parsed = rescheduleOccurrenceSchema.parse({
    ruleId,
    occurrenceFor: originalScheduledForStr,
    newScheduledFor: newScheduledForStr,
    overrides,
  });
  await rescheduleVirtualOccurrence(
    parsed.ruleId,
    new Date(parsed.occurrenceFor),
    new Date(parsed.newScheduledFor),
    parsed.overrides,
  );
  revalidatePath("/schedule");
  return { success: true };
}

export async function deleteRecurrenceRuleAction(ruleId: string) {
  await requireAdmin();
  await deleteRecurringSchedule(idSchema.parse(ruleId));
  revalidatePath("/schedule");
  return { success: true };
}

export async function getEnrollmentMonthSummaryAction(
  enrollmentId: string,
  dateStr: string
) {
  await requireAdmin();
  return getEnrollmentMonthSummary(
    idSchema.parse(enrollmentId),
    new Date(isoDateTimeSchema.parse(dateStr)),
  );
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

  const monthKey = monthSchema.parse(monthParam);
  const centerTimeZone = getConfiguredCenterTimeZone();

  const { realSessions, virtualSessions, paidMonths } =
    await getMonthSchedule(monthKey);

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
      ? paidMonths.has(
          `${s.enrollmentId}:${getCalendarMonthKey(
            s.scheduledFor,
            centerTimeZone,
          )}`,
        )
      : null as boolean | null,
  }));

  const virtual = virtualSessions.map((v) => ({
    ...v,
    notes: null as string | null,
    recurrenceRuleId: null as string | null,
    isPaid: v.enrollmentId
      ? paidMonths.has(
          `${v.enrollmentId}:${getCalendarMonthKey(
            new Date(v.scheduledFor),
            centerTimeZone,
          )}`,
        )
      : null,
  }));

  return { sessions, virtual };
}

export async function getActiveRecurrenceRulesAction(enrollmentId: string) {
  await requireAdmin();
  return getActiveRecurrenceRulesForEnrollment(idSchema.parse(enrollmentId));
}

export async function updateEnrollmentRecurrenceColorAction(
  enrollmentId: string,
  color: string
) {
  await requireAdmin();
  await updateEnrollmentRecurrenceColor(
    idSchema.parse(enrollmentId),
    z.string().regex(/^#[0-9a-fA-F]{6}$/).parse(color),
  );
  revalidatePath("/schedule");
  return { success: true };
}

export async function getActiveRecurrenceRulesForGroupAction(groupId: string) {
  await requireAdmin();
  return getActiveRecurrenceRulesForGroup(idSchema.parse(groupId));
}
