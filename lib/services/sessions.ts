import "server-only";

import {
  addDays,
  format,
  startOfDay,
  startOfWeek,
  endOfMonth,
  endOfWeek,
  isBefore,
  subMonths,
  addMonths,
} from "date-fns";
import { getEnrollmentPaidMonths } from "@/lib/services/payments";
import {
  createSessionWithAttendances,
  createRecurrenceRules,
  updateAttendanceAndSessionStatus,
  cancelSession,
  deleteSession,
  getSessionsByMonth,
  getRecurrenceRuleById,
  getRecurrenceRuleWithParticipants,
  getEnrollmentForSession,
  getRecurrenceRulesForMonth,
  getGroupRecurrenceRulesForMonth,
  updateRecurrenceRulesColorForEnrollment,
  updateSession as updateSessionData,
  endRecurrenceRuleData,
  splitRecurrenceRuleData,
  deleteRecurringScheduleData,
  getSession,
} from "@/lib/data/sessions";
import { getGroupWithMembers } from "@/lib/data/groups";
import {
  addCalendarDays,
  combineDateAndTime,
  DEFAULT_CENTER_TIME_ZONE,
  getCalendarDateInTimeZone,
  getCalendarDateKey,
  getEnrollmentWeekKey,
  getFirstMatchingDate,
} from "@/lib/services/session-dates";
import {
  assertNoRecurringScheduleConflict,
  assertNoScheduleConflict,
  type ConflictStudent,
} from "@/lib/services/session-conflicts";
import {
  materializeGroupSessions,
  materializeSessions,
} from "@/lib/services/session-materialization";
import type {
  CreateAdHocSessionInput,
  CreateRecurrenceInput,
  MarkAttendanceInput,
} from "@/lib/validators/sessions";
import { isValidTimeZone } from "@/lib/validators/common";
import {
  assertEnrollmentHasMonthlyCapacity,
  getRecurringSchedulePreview,
} from "@/lib/services/session-capacity";
import {
  createAdHocSessionSchema,
  createRecurrenceSchema,
  markAttendanceSchema,
} from "@/lib/validators/sessions";

// ─── Types ────────────────────────────────────────────────────────────────────

export type VirtualSession = {
  id: string;
  scheduledFor: string; // ISO string — safe to pass server→client
  durationMinutes: number;
  status: "VIRTUAL_UPCOMING" | "VIRTUAL_DEPLETED";
  room: string | null;
  color: string | null;
  tutor: { firstName: string; lastName: string };
  subject: { name: string };
  attendance: Array<{ student: { firstName: string; lastName: string } }>;
  virtual: true;
  ruleId: string;
  enrollmentId: string | null;
  groupId?: string | null;
  groupName?: string | null;
  // Rule params — needed for edit dialog
  startTime: string;
  dayOfWeek: number;
  intervalWeeks: number;
};

export type EnrollmentSessionSummary = {
  enrollmentId: string;
  studentName: string;
  subjectName: string;
  sessionsPerWeek: number | null;
  usedThisWeek: number;
  remaining: number | null;
  isDepleted: boolean;
};

// ─── Enrollment color palette ─────────────────────────────────────────────────

const ENROLLMENT_PALETTE = [
  "#ef4444","#f97316","#f59e0b","#84cc16","#10b981",
  "#14b8a6","#06b6d4","#0ea5e9","#6366f1","#8b5cf6",
  "#a855f7","#ec4899",
];

function hashEnrollmentColor(enrollmentId: string): string {
  let h = 0;
  for (let i = 0; i < enrollmentId.length; i++) {
    h = ((h << 5) - h) + enrollmentId.charCodeAt(i);
    h = h & h;
  }
  return ENROLLMENT_PALETTE[Math.abs(h) % ENROLLMENT_PALETTE.length];
}

// ─── Ad-hoc session ───────────────────────────────────────────────────────────

export async function createAdHocSession(input: CreateAdHocSessionInput) {
  const parsed = createAdHocSessionSchema.parse(input);
  const scheduledFor = new Date(parsed.scheduledFor);
  const duration = Number(parsed.durationMinutes);

  // Resolve group members if groupId is provided
  let sessionEnrollmentId: string | undefined = parsed.enrollmentId || undefined;
  let group: Awaited<ReturnType<typeof getGroupWithMembers>> | null = null;
  let studentIds = parsed.studentIds;

  if (parsed.groupId) {
    sessionEnrollmentId = undefined;
    group = await getGroupWithMembers(parsed.groupId);
    if (!group) throw new Error("Group not found");
    studentIds = group.enrollments.map((enrollment) => enrollment.studentId);
    // Skip monthly capacity check for group sessions
  } else {
    await assertEnrollmentHasMonthlyCapacity(
      sessionEnrollmentId,
      scheduledFor
    );
  }

  await assertNoScheduleConflict({
    tutorId: parsed.tutorId,
    subjectId: parsed.subjectId,
    studentIds,
    scheduledFor,
    durationMinutes: duration,
  });

  const enrollment = sessionEnrollmentId
    ? await getEnrollmentForSession(sessionEnrollmentId)
    : null;
  const attendanceRows = parsed.groupId
    ? group!.enrollments.map((groupEnrollment) => ({
        studentId: groupEnrollment.studentId,
        enrollmentId: groupEnrollment.id,
      }))
    : studentIds.map((studentId) => ({
        studentId,
        enrollmentId: enrollment?.id,
      }));

  return createSessionWithAttendances(
    {
      enrollmentId: sessionEnrollmentId,
      tutorId: parsed.tutorId,
      subjectId: parsed.subjectId,
      scheduledFor,
      durationMinutes: duration,
      room: parsed.room || undefined,
      notes: parsed.notes || undefined,
    },
    attendanceRows,
  );
}

// ─── Recurring schedule — store rules only, no pre-generated sessions ─────────

export async function createRecurringSchedule(input: CreateRecurrenceInput) {
  const parsed = createRecurrenceSchema.parse(input);
  const preview = await getRecurringSchedulePreview(parsed);
  if (!parsed.groupId && preview.firstExceededDate && !parsed.endsOn) {
    throw new Error(
      "This recurrence exceeds the package limit. Add an end date or adjust the pattern before creating it."
    );
  }

  const daysOfWeek = parsed.daysOfWeek.map(Number);
  const duration = Number(parsed.durationMinutes);
  const intervalWeeks = parsed.intervalWeeks ? Number(parsed.intervalWeeks) : 1;
  const startsOn = new Date(parsed.startsOn);
  const endsOn = parsed.endsOn ? new Date(parsed.endsOn) : undefined;
  const timeZone = process.env.CENTER_TIME_ZONE ?? DEFAULT_CENTER_TIME_ZONE;
  if (!isValidTimeZone(timeZone)) {
    throw new Error("CENTER_TIME_ZONE is not a valid IANA time zone");
  }

  let ruleEnrollmentId: string | undefined;
  let ruleGroupId: string | undefined;
  let ruleColor = parsed.color;
  let scheduleTutorId: string;
  let scheduleSubjectId: string;
  let scheduleStudents: ConflictStudent[];

  if (parsed.groupId) {
    ruleGroupId = parsed.groupId;
    const group = await getGroupWithMembers(parsed.groupId);
    if (!group) throw new Error("Group not found");
    scheduleTutorId = group.tutorId;
    scheduleSubjectId = group.subjectId;
    scheduleStudents = group.enrollments.map((enrollment) => enrollment.student);
    ruleColor = ruleColor ?? hashEnrollmentColor(parsed.groupId);
  } else {
    ruleEnrollmentId = parsed.enrollmentId;
    const enrollment = await getEnrollmentForSession(parsed.enrollmentId!);
    if (!enrollment) throw new Error("Enrollment not found");
    scheduleTutorId = enrollment.tutorId;
    scheduleSubjectId = enrollment.subjectId;
    scheduleStudents = [enrollment.student];
    ruleColor = ruleColor ?? hashEnrollmentColor(parsed.enrollmentId!);
  }

  await assertNoRecurringScheduleConflict({
    tutorId: scheduleTutorId,
    subjectId: scheduleSubjectId,
    students: scheduleStudents,
    daysOfWeek,
    startTime: parsed.startTime,
    startTimes: parsed.startTimes,
    durationMinutes: duration,
    intervalWeeks,
    startsOn,
    endsOn,
    timeZone,
  });

  const rules = await createRecurrenceRules(daysOfWeek.map((dayOfWeek) => {
    const dayKey = String(dayOfWeek) as
      | "0"
      | "1"
      | "2"
      | "3"
      | "4"
      | "5"
      | "6";
    return {
      enrollmentId: ruleEnrollmentId,
      groupId: ruleGroupId,
      dayOfWeek,
      startTime: parsed.startTimes?.[dayKey] ?? parsed.startTime,
      timeZone,
      durationMinutes: duration,
      intervalWeeks,
      room: parsed.room || undefined,
      color: ruleColor,
      startsOn,
      endsOn,
    };
  }));

  const now = new Date();
  if (isBefore(startsOn, now)) {
    await materializeSessions(startsOn, now, {
      recurrenceRuleIds: rules.map((r) => r.id),
    });
    await materializeGroupSessions(startsOn, now, {
      recurrenceRuleIds: rules.map((r) => r.id),
    });
  }
  const materializedSessions = await materializeSessions(now, addDays(now, 30), {
    recurrenceRuleIds: rules.map((rule) => rule.id),
  });
  await materializeGroupSessions(now, addDays(now, 30), {
    recurrenceRuleIds: rules.map((rule) => rule.id),
  });

  return { rulesCreated: rules.length, materializedSessions, preview };
}

// ─── Virtual sessions ─────────────────────────────────────────────────────────

type RealSessionSlim = {
  enrollmentId: string | null;
  scheduledFor: Date | string;
  status: string;
  recurrenceRuleId?: string | null;
  recurrenceOccurrenceFor?: Date | string | null;
};

type MonthRules = Awaited<ReturnType<typeof getRecurrenceRulesForMonth>>;

export async function getVirtualSessionsForMonth(
  monthStart: Date,
  realSessions: RealSessionSlim[],
  prefetchedRules?: MonthRules
): Promise<VirtualSession[]> {
  const calendarMonthStart = new Date(
    Date.UTC(monthStart.getUTCFullYear(), monthStart.getUTCMonth(), 1),
  );
  const calendarMonthEnd = new Date(
    Date.UTC(monthStart.getUTCFullYear(), monthStart.getUTCMonth() + 1, 0),
  );
  const today = new Date();
  const rules = prefetchedRules ?? await getRecurrenceRulesForMonth(monthStart);

  const plannedPerEnrollmentWeek = new Map<string, number>();
  for (const s of realSessions) {
    if (
      !s.enrollmentId ||
      ["CANCELLED_BY_TUTOR", "CANCELLED_BY_STUDENT"].includes(s.status)
    ) {
      continue;
    }
    const d = new Date(s.scheduledFor);
    if (
      getCalendarDateKey(d) >= calendarMonthStart.toISOString().slice(0, 10) &&
      getCalendarDateKey(d) <= calendarMonthEnd.toISOString().slice(0, 10)
    ) {
      const key = getEnrollmentWeekKey(s.enrollmentId, d);
      plannedPerEnrollmentWeek.set(key, (plannedPerEnrollmentWeek.get(key) ?? 0) + 1);
    }
  }

  const virtual: VirtualSession[] = [];

  for (const rule of rules) {
    const { enrollment } = rule;
    if (!enrollment || !rule.enrollmentId) continue;
    const sessionsPerWeek = enrollment.package.sessionsPerWeek ?? null;

    let current = getFirstMatchingDate(
      new Date(rule.startsOn),
      rule.dayOfWeek,
    );

    // Advance to the month window
    while (current < calendarMonthStart) {
      current = addCalendarDays(current, rule.intervalWeeks * 7);
    }

    while (current <= calendarMonthEnd) {
      if (rule.endsOn && current > new Date(rule.endsOn)) break;

      const scheduledFor = combineDateAndTime(
        current,
        rule.startTime,
        rule.timeZone,
      );

      // Skip if a real session already covers this slot.
      // A rescheduled real session links back via recurrenceRuleId, suppressing
      // the virtual slot even when the hour differs.
      const hasReal = realSessions.some(
        (s) =>
          s.recurrenceRuleId === rule.id &&
          new Date(s.recurrenceOccurrenceFor ?? s.scheduledFor).getTime() ===
            scheduledFor.getTime()
      );

      if (!hasReal) {
        // Past slots should have been materialized already; skip them here
        if (isBefore(scheduledFor, today)) {
          current = addCalendarDays(current, rule.intervalWeeks * 7);
          continue;
        }

        const weekKey = getEnrollmentWeekKey(
          rule.enrollmentId,
          scheduledFor,
          rule.timeZone,
        );
        const weekCount = plannedPerEnrollmentWeek.get(weekKey) ?? 0;
        const status: VirtualSession["status"] =
          sessionsPerWeek !== null && weekCount >= sessionsPerWeek
            ? "VIRTUAL_DEPLETED"
            : "VIRTUAL_UPCOMING";

        virtual.push({
          id: `virtual_${rule.id}_${format(scheduledFor, "yyyyMMddHHmm")}`,
          scheduledFor: scheduledFor.toISOString(),
          durationMinutes: rule.durationMinutes,
          status,
          room: rule.room,
          color: rule.color ?? null,
          tutor: {
            firstName: enrollment.tutor.firstName,
            lastName: enrollment.tutor.lastName,
          },
          subject: { name: enrollment.subject.name },
          attendance: [
            {
              student: {
                firstName: enrollment.student.firstName,
                lastName: enrollment.student.lastName,
              },
            },
          ],
          virtual: true,
          ruleId: rule.id,
          enrollmentId: rule.enrollmentId,
          startTime: rule.startTime,
          dayOfWeek: rule.dayOfWeek,
          intervalWeeks: rule.intervalWeeks,
        });

        if (status === "VIRTUAL_UPCOMING") {
          plannedPerEnrollmentWeek.set(weekKey, weekCount + 1);
        }
      }

      current = addCalendarDays(current, rule.intervalWeeks * 7);
    }
  }

  // ─── Group virtual sessions ────────────────────────────────────────────────
  const groupRules = await getGroupRecurrenceRulesForMonth(monthStart);

  for (const rule of groupRules) {
    if (!rule.group) continue;

    let current = getFirstMatchingDate(
      new Date(rule.startsOn),
      rule.dayOfWeek,
    );
    while (current < calendarMonthStart) {
      current = addCalendarDays(current, rule.intervalWeeks * 7);
    }

    while (current <= calendarMonthEnd) {
      if (rule.endsOn && current > new Date(rule.endsOn)) break;

      const scheduledFor = combineDateAndTime(
        current,
        rule.startTime,
        rule.timeZone,
      );

      const hasReal = realSessions.some(
        (s) =>
          s.recurrenceRuleId === rule.id &&
          new Date(s.recurrenceOccurrenceFor ?? s.scheduledFor).getTime() ===
            scheduledFor.getTime(),
      );

      if (!hasReal && !isBefore(scheduledFor, today)) {
        virtual.push({
          id: `virtual_${rule.id}_${format(scheduledFor, "yyyyMMddHHmm")}`,
          scheduledFor: scheduledFor.toISOString(),
          durationMinutes: rule.durationMinutes,
          status: "VIRTUAL_UPCOMING",
          room: rule.room,
          color: rule.color ?? null,
          tutor: {
            firstName: rule.group.tutor.firstName,
            lastName: rule.group.tutor.lastName,
          },
          subject: { name: rule.group.subject.name },
          attendance: rule.group.enrollments.map((e) => ({
            student: {
              firstName: e.student.firstName,
              lastName: e.student.lastName,
            },
          })),
          virtual: true,
          ruleId: rule.id,
          enrollmentId: null,
          groupId: rule.groupId,
          groupName: rule.group.name,
          startTime: rule.startTime,
          dayOfWeek: rule.dayOfWeek,
          intervalWeeks: rule.intervalWeeks,
        });
      }

      current = addCalendarDays(current, rule.intervalWeeks * 7);
    }
  }

  return virtual;
}

// ─── Sessions remaining per enrollment ────────────────────────────────────────

export async function getEnrollmentSessionSummaries(
  monthStart: Date,
  realSessions: RealSessionSlim[],
  prefetchedRules?: MonthRules
): Promise<EnrollmentSessionSummary[]> {
  const weekStart = startOfWeek(monthStart, { weekStartsOn: 1 });
  const weekEnd = endOfWeek(monthStart, { weekStartsOn: 1 });
  const rules = prefetchedRules ?? await getRecurrenceRulesForMonth(monthStart);

  const seen = new Map<string, EnrollmentSessionSummary>();

  for (const rule of rules) {
    if (!rule.enrollmentId || !rule.enrollment) continue;
    if (seen.has(rule.enrollmentId)) continue;
    const { enrollment } = rule;
    const sessionsPerWeek = enrollment.package.sessionsPerWeek ?? null;

    const usedThisWeek = realSessions.filter(
      (s) =>
        s.enrollmentId === rule.enrollmentId &&
        (s.status === "COMPLETED" || s.status === "NO_SHOW") &&
        new Date(s.scheduledFor) >= weekStart &&
        new Date(s.scheduledFor) <= weekEnd
    ).length;

    const remaining =
      sessionsPerWeek !== null
        ? Math.max(0, sessionsPerWeek - usedThisWeek)
        : null;

    seen.set(rule.enrollmentId, {
      enrollmentId: rule.enrollmentId,
      studentName: `${enrollment.student.firstName} ${enrollment.student.lastName}`,
      subjectName: enrollment.subject.name,
      sessionsPerWeek,
      usedThisWeek,
      remaining,
      isDepleted: sessionsPerWeek !== null && usedThisWeek >= sessionsPerWeek,
    });
  }

  return Array.from(seen.values());
}

// ─── Attendance & status ──────────────────────────────────────────────────────

export async function markSessionAttendance(
  sessionId: string,
  input: MarkAttendanceInput
) {
  const parsed = markAttendanceSchema.parse(input);

  const allStatuses = parsed.attendances.map((a) => a.status);
  const hasCompleted = allStatuses.some((s) => s === "COMPLETED");
  const allScheduled = allStatuses.every((s) => s === "SCHEDULED");
  const allNoShow = allStatuses.every((s) => s === "NO_SHOW");
  const allCancelledTutor = allStatuses.every((s) => s === "CANCELLED_BY_TUTOR");
  const allCancelledStudent = allStatuses.every(
    (s) => s === "CANCELLED_BY_STUDENT"
  );

  let sessionStatus:
    | "COMPLETED"
    | "NO_SHOW"
    | "CANCELLED_BY_TUTOR"
    | "CANCELLED_BY_STUDENT"
    | "SCHEDULED" = "SCHEDULED";
  if (allScheduled) sessionStatus = "SCHEDULED";
  else if (hasCompleted) sessionStatus = "COMPLETED";
  else if (allNoShow) sessionStatus = "NO_SHOW";
  else if (allCancelledTutor) sessionStatus = "CANCELLED_BY_TUTOR";
  else if (allCancelledStudent) sessionStatus = "CANCELLED_BY_STUDENT";

  await updateAttendanceAndSessionStatus(
    sessionId,
    parsed.attendances,
    sessionStatus,
  );
}

export async function updateScheduledSession(
  sessionId: string,
  data: {
    scheduledFor?: Date;
    durationMinutes?: number;
    room?: string | null;
    notes?: string | null;
  },
) {
  const session = await getSession(sessionId);
  if (!session) throw new Error("Session not found");

  const scheduledFor = data.scheduledFor ?? new Date(session.scheduledFor);
  const durationMinutes = data.durationMinutes ?? session.durationMinutes;
  const studentIds =
    session.attendance.length > 0
      ? session.attendance.map((attendance) => attendance.studentId)
      : session.enrollment
        ? [session.enrollment.studentId]
        : [];

  await assertNoScheduleConflict({
    tutorId: session.tutorId,
    subjectId: session.subjectId,
    studentIds,
    scheduledFor,
    durationMinutes,
    excludeSessionId: session.id,
    excludeRuleOccurrence:
      session.recurrenceRuleId && session.recurrenceOccurrenceFor
        ? {
            ruleId: session.recurrenceRuleId,
            occurrenceFor: session.recurrenceOccurrenceFor,
          }
        : undefined,
  });

  return updateSessionData(sessionId, data);
}

export async function cancelSessionById(
  id: string,
  cancelledBy: "TUTOR" | "STUDENT"
) {
  return cancelSession(id, cancelledBy);
}

export async function deleteSessionById(id: string) {
  return deleteSession(id);
}

// ─── Recurrence rule management ───────────────────────────────────────────────

export async function splitRecurrenceRule(
  ruleId: string,
  splitDate: Date,
  newParams: {
    startTime?: string;
    durationMinutes?: number;
    room?: string | null;
    intervalWeeks?: number;
    dayOfWeek?: number;
  }
) {
  const rule = await getRecurrenceRuleWithParticipants(ruleId);
  if (!rule) throw new Error("Recurrence rule not found");

  const splitDay = getCalendarDateInTimeZone(splitDate, rule.timeZone);
  const ruleStart = new Date(rule.startsOn);

  // If the rule is already closed before the split date, nothing to do
  if (rule.endsOn && new Date(rule.endsOn) < splitDay) {
    return rule;
  }

  const target = rule.enrollment
    ? {
        tutorId: rule.enrollment.tutorId,
        subjectId: rule.enrollment.subjectId,
        students: [rule.enrollment.student],
      }
    : rule.group
      ? {
          tutorId: rule.group.tutorId,
          subjectId: rule.group.subjectId,
          students: rule.group.enrollments.map(
            (enrollment) => enrollment.student,
          ),
        }
      : null;
  if (!target) throw new Error("Recurrence rule has no enrollment or group");

  await assertNoRecurringScheduleConflict({
    tutorId: target.tutorId,
    subjectId: target.subjectId,
    students: target.students,
    daysOfWeek: [newParams.dayOfWeek ?? rule.dayOfWeek],
    startTime: newParams.startTime ?? rule.startTime,
    durationMinutes:
      newParams.durationMinutes ?? rule.durationMinutes,
    intervalWeeks: newParams.intervalWeeks ?? rule.intervalWeeks,
    startsOn: splitDay,
    endsOn: rule.endsOn ? new Date(rule.endsOn) : undefined,
    timeZone: rule.timeZone,
    excludeRecurrenceRuleId: rule.id,
  });

  const update = {
    startTime: newParams.startTime ?? rule.startTime,
    durationMinutes: newParams.durationMinutes ?? rule.durationMinutes,
    room: newParams.room !== undefined ? newParams.room : rule.room,
    intervalWeeks: newParams.intervalWeeks ?? rule.intervalWeeks,
    dayOfWeek: newParams.dayOfWeek ?? rule.dayOfWeek,
  };
  const newRule = {
    enrollmentId: rule.enrollmentId ?? undefined,
    groupId: rule.groupId ?? undefined,
    dayOfWeek: update.dayOfWeek,
    startTime: update.startTime,
    timeZone: rule.timeZone,
    durationMinutes: update.durationMinutes,
    intervalWeeks: update.intervalWeeks,
    room:
      update.room === null ? undefined : update.room,
    color: rule.color ?? undefined,
    startsOn: splitDay,
    endsOn: rule.endsOn ? new Date(rule.endsOn) : undefined,
  };
  return splitRecurrenceRuleData({
    ruleId,
    cutoff: combineDateAndTime(splitDay, "00:00", rule.timeZone),
    updateInPlace: splitDay <= ruleStart,
    update,
    oldRuleEndsOn: addCalendarDays(splitDay, -1),
    newRule,
  });
}

export async function endRecurrenceFromDate(ruleId: string, fromDate: Date) {
  const rule = await getRecurrenceRuleById(ruleId);
  if (!rule) throw new Error("Recurrence rule not found");
  const calendarDate = getCalendarDateInTimeZone(fromDate, rule.timeZone);
  await endRecurrenceRuleData({
    ruleId,
    cutoff: combineDateAndTime(calendarDate, "00:00", rule.timeZone),
    endsOn: addCalendarDays(calendarDate, -1),
  });
}

export async function deleteRecurringSchedule(ruleId: string) {
  const rule = await getRecurrenceRuleById(ruleId);
  if (!rule) throw new Error("Recurrence rule not found");

  return deleteRecurringScheduleData(ruleId, new Date());
}

// ─── Optimized month fetch (sessions + rules fetched in parallel) ─────────────

export async function getMonthSchedule(monthStart: Date) {
  // Materialize any past recurring slots so they show as real DB records
  const now = new Date();
  const monthEnd = endOfMonth(monthStart);
  if (isBefore(monthStart, now)) {
    const pastEnd = isBefore(monthEnd, now) ? monthEnd : now;
    await materializeSessions(startOfDay(monthStart), pastEnd);
    await materializeGroupSessions(startOfDay(monthStart), pastEnd);
  }

  const [realSessions, rules] = await Promise.all([
    getSessionsByMonth(monthStart),
    getRecurrenceRulesForMonth(monthStart),
  ]);

  const enrollmentIds = [...new Set([
    ...rules.map((r) => r.enrollmentId).filter((id): id is string => id !== null),
    ...realSessions.filter((s) => s.enrollmentId != null).map((s) => s.enrollmentId as string),
  ])];
  // Cover the calendar grid which may show days from adjacent months
  const months = [
    format(subMonths(monthStart, 1), "yyyy-MM"),
    format(monthStart, "yyyy-MM"),
    format(addMonths(monthStart, 1), "yyyy-MM"),
  ];

  const [virtualSessions, summaries, paidMonthRecords] = await Promise.all([
    getVirtualSessionsForMonth(monthStart, realSessions, rules),
    getEnrollmentSessionSummaries(monthStart, realSessions, rules),
    getEnrollmentPaidMonths(enrollmentIds, months),
  ]);

  // "enrollmentId:yyyy-MM" → paid
  const paidMonths = new Set(
    paidMonthRecords
      .filter((p) => p.enrollmentId && p.coversMonth)
      .map((p) => `${p.enrollmentId}:${p.coversMonth}`)
  );

  return { realSessions, virtualSessions, summaries, paidMonths };
}

export async function updateEnrollmentRecurrenceColor(
  enrollmentId: string,
  color: string
) {
  await updateRecurrenceRulesColorForEnrollment(enrollmentId, color);
}

export { combineDateAndTime, getFirstMatchingDate } from "@/lib/services/session-dates";
export { materializeGroupSessions, materializeSessions } from "@/lib/services/session-materialization";
export {
  cancelVirtualOccurrence,
  rescheduleVirtualOccurrence,
} from "@/lib/services/session-occurrences";
export {
  getEnrollmentMonthSummary,
  getRecurringSchedulePreview,
} from "@/lib/services/session-capacity";
export type {
  EnrollmentMonthSummary,
  RecurringSchedulePreview,
} from "@/lib/services/session-capacity";
export {
  getActiveRecurrenceRulesForEnrollment,
  getActiveRecurrenceRulesForGroup,
  getSession,
  getSessionsByMonth,
  getSessionsByWeek,
  updateSessionStatus,
} from "@/lib/data/sessions";
