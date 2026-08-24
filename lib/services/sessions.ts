import "server-only";

import { addDays, format, isBefore } from "date-fns";
import { getEnrollmentPaidMonths } from "@/lib/services/payments";
import {
  createSessionWithAttendances,
  createRecurrenceRules,
  updateAttendanceAndSessionStatus,
  cancelSession,
  deleteSession,
  getSessionsByMonth,
  getSessionsForAssistantMonth,
  getAssistantSessionSlots,
  getSessionsForAssistantRange,
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
  getActiveRecurrenceRulesForEnrollment as getActiveRecurrenceRulesForEnrollmentData,
  getActiveRecurrenceRulesForGroup as getActiveRecurrenceRulesForGroupData,
  listRecurrenceRulesForAssistant as listRecurrenceRulesForAssistantData,
} from "@/lib/data/sessions";
import { getGroupWithMembers } from "@/lib/data/groups";
import {
  addCalendarMonths,
  addCalendarDays,
  combineDateAndTime,
  getCalendarDateInTimeZone,
  getCalendarDateKey,
  getCalendarMonthRange,
  getCalendarWeekRange,
  getConfiguredCenterTimeZone,
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
import {
  assertEnrollmentHasMonthlyCapacity,
  getRecurringSchedulePreview,
} from "@/lib/services/session-capacity";
import { summarizeAssistantWeekSchedule } from "@/lib/services/assistant/schedule-summary";
import {
  createAdHocSessionSchema,
  createRecurrenceSchema,
  markAttendanceSchema,
} from "@/lib/validators/sessions";
import {
  assertEnrollmentEligibleForSession,
  assertEnrollmentEligibleOnCalendarDate,
  assertSessionDateWithinEnrollmentBounds,
  isEnrollmentEligibleForSession,
  isEnrollmentEligibleOnCalendarDate,
} from "@/lib/services/enrollment-schedule-dates";

// ─── Types ────────────────────────────────────────────────────────────────────

export type VirtualSession = {
  id: string;
  scheduledFor: string; // ISO string — safe to pass server→client
  durationMinutes: number;
  status: "VIRTUAL_UPCOMING" | "VIRTUAL_DEPLETED";
  room: string | null;
  color: string | null;
  tutor: { id: string; firstName: string; lastName: string };
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
  "#ef4444",
  "#f97316",
  "#f59e0b",
  "#84cc16",
  "#10b981",
  "#14b8a6",
  "#06b6d4",
  "#0ea5e9",
  "#6366f1",
  "#8b5cf6",
  "#a855f7",
  "#ec4899",
];

function hashEnrollmentColor(enrollmentId: string): string {
  let h = 0;
  for (let i = 0; i < enrollmentId.length; i++) {
    h = (h << 5) - h + enrollmentId.charCodeAt(i);
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
  let sessionEnrollmentId: string | undefined =
    parsed.enrollmentId || undefined;
  let group: Awaited<ReturnType<typeof getGroupWithMembers>> | null = null;
  let enrollment: Awaited<ReturnType<typeof getEnrollmentForSession>> | null =
    null;
  let studentIds = parsed.studentIds;
  let tutorId = parsed.tutorId;
  let subjectId = parsed.subjectId;

  if (parsed.groupId) {
    sessionEnrollmentId = undefined;
    group = await getGroupWithMembers(parsed.groupId);
    if (!group) throw new Error("Group not found");
    const eligibleEnrollments = group.enrollments.filter((groupEnrollment) =>
      isEnrollmentEligibleForSession(
        groupEnrollment,
        scheduledFor,
        getConfiguredCenterTimeZone(),
      ),
    );
    if (eligibleEnrollments.length === 0) {
      throw new Error("This group has no active enrollments on that date");
    }
    tutorId = group.tutorId;
    subjectId = group.subjectId;
    studentIds = eligibleEnrollments.map(
      (groupEnrollment) => groupEnrollment.studentId,
    );
    // Skip monthly capacity check for group sessions
  } else if (sessionEnrollmentId) {
    enrollment = await getEnrollmentForSession(sessionEnrollmentId);
    if (!enrollment) throw new Error("Enrollment not found");
    assertEnrollmentEligibleForSession(
      enrollment,
      scheduledFor,
      getConfiguredCenterTimeZone(),
    );
    tutorId = enrollment.tutorId;
    subjectId = enrollment.subjectId;
    studentIds = [enrollment.studentId];
    await assertEnrollmentHasMonthlyCapacity(sessionEnrollmentId, scheduledFor);
  }

  if (!tutorId || !subjectId || studentIds.length === 0) {
    throw new Error(
      "Tutor, subject, and at least one student are required for this session",
    );
  }

  await assertNoScheduleConflict({
    tutorId,
    subjectId,
    studentIds,
    scheduledFor,
    durationMinutes: duration,
  });

  const attendanceRows = parsed.groupId
    ? group!.enrollments
        .filter((groupEnrollment) =>
          isEnrollmentEligibleForSession(
            groupEnrollment,
            scheduledFor,
            getConfiguredCenterTimeZone(),
          ),
        )
        .map((groupEnrollment) => ({
          studentId: groupEnrollment.studentId,
          enrollmentId: groupEnrollment.id,
        }))
    : enrollment
      ? [
          {
            studentId: enrollment.studentId,
            enrollmentId: enrollment.id,
          },
        ]
      : studentIds.map((studentId) => ({ studentId }));

  return createSessionWithAttendances(
    {
      enrollmentId: sessionEnrollmentId,
      tutorId,
      subjectId,
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
  const daysOfWeek = parsed.daysOfWeek.map(Number);
  const duration = Number(parsed.durationMinutes);
  const intervalWeeks = parsed.intervalWeeks ? Number(parsed.intervalWeeks) : 1;
  const startsOn = new Date(parsed.startsOn);
  const requestedEndsOn = parsed.endsOn ? new Date(parsed.endsOn) : undefined;
  let effectiveEndsOn = requestedEndsOn;
  const timeZone = getConfiguredCenterTimeZone();

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
    scheduleStudents = group.enrollments.map(
      (enrollment) => enrollment.student,
    );
    ruleColor = ruleColor ?? hashEnrollmentColor(parsed.groupId);
  } else {
    ruleEnrollmentId = parsed.enrollmentId;
    const enrollment = await getEnrollmentForSession(parsed.enrollmentId!);
    if (!enrollment) throw new Error("Enrollment not found");
    assertEnrollmentEligibleOnCalendarDate(enrollment, startsOn);
    if (requestedEndsOn) {
      assertEnrollmentEligibleOnCalendarDate(enrollment, requestedEndsOn);
    }
    effectiveEndsOn ??= enrollment.endDate ?? undefined;
    scheduleTutorId = enrollment.tutorId;
    scheduleSubjectId = enrollment.subjectId;
    scheduleStudents = [enrollment.student];
    ruleColor = ruleColor ?? hashEnrollmentColor(parsed.enrollmentId!);
  }

  const previewInput =
    effectiveEndsOn && !parsed.endsOn
      ? {
          ...parsed,
          endsOn: effectiveEndsOn.toISOString().slice(0, 10),
        }
      : parsed;
  const preview = await getRecurringSchedulePreview(previewInput);
  if (!parsed.groupId && preview.firstExceededDate && !effectiveEndsOn) {
    throw new Error(
      "This recurrence exceeds the package limit. Add an end date or adjust the pattern before creating it.",
    );
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
    endsOn: effectiveEndsOn,
    timeZone,
  });

  const rules = await createRecurrenceRules(
    daysOfWeek.map((dayOfWeek) => {
      const dayKey = String(dayOfWeek) as
        "0" | "1" | "2" | "3" | "4" | "5" | "6";
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
        endsOn: effectiveEndsOn,
      };
    }),
  );

  const now = new Date();
  const through = addDays(now, 30);
  const recurrenceRuleIds = rules.map((rule) => rule.id);
  const materializationTasks: Array<() => Promise<number>> = [];
  if (isBefore(startsOn, now)) {
    materializationTasks.push(
      () => materializeSessions(startsOn, now, { recurrenceRuleIds }),
      () => materializeGroupSessions(startsOn, now, { recurrenceRuleIds }),
    );
  }
  materializationTasks.push(
    () => materializeSessions(now, through, { recurrenceRuleIds }),
    () => materializeGroupSessions(now, through, { recurrenceRuleIds }),
  );

  let materializedSessions = 0;
  let materializationFailures = 0;
  for (const materialize of materializationTasks) {
    try {
      materializedSessions += await materialize();
    } catch {
      materializationFailures += 1;
    }
  }

  return {
    rulesCreated: rules.length,
    materializedSessions,
    preview,
    warnings:
      materializationFailures > 0
        ? [
            "The recurring schedule was created, but some upcoming sessions could not be prepared yet. They will be retried by schedule maintenance.",
          ]
        : [],
  };
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

const ASSISTANT_RECURRENCE_LIMITS = {
  rules: 1_000,
  groupEnrollments: 100,
  virtualSessions: 5_000,
} as const;

type VirtualSessionSafetyLimits = typeof ASSISTANT_RECURRENCE_LIMITS;

function assertVirtualSessionCapacity(
  currentCount: number,
  limits?: VirtualSessionSafetyLimits,
) {
  if (limits && currentCount >= limits.virtualSessions) {
    throw new Error(
      "The schedule exceeds the 5,000-virtual-session assistant safety bound. Narrow the request to a smaller date range or an exact record.",
    );
  }
}

export async function getVirtualSessionsForMonth(
  monthStart: Date,
  realSessions: RealSessionSlim[],
  prefetchedRules?: MonthRules,
  includePast = false,
  safetyLimits?: VirtualSessionSafetyLimits,
): Promise<VirtualSession[]> {
  const calendarMonthStart = new Date(
    Date.UTC(monthStart.getUTCFullYear(), monthStart.getUTCMonth(), 1),
  );
  const calendarMonthEnd = new Date(
    Date.UTC(monthStart.getUTCFullYear(), monthStart.getUTCMonth() + 1, 0),
  );
  const today = new Date();
  const centerTimeZone = getConfiguredCenterTimeZone();
  const rules =
    prefetchedRules ??
    (await getRecurrenceRulesForMonth(
      calendarMonthStart,
      calendarMonthEnd,
      safetyLimits?.rules,
    ));
  if (safetyLimits && rules.length > safetyLimits.rules) {
    throw new Error(
      "The schedule exceeds the 1,000-recurrence-rule assistant safety bound. Narrow the request to an exact enrollment, group, or rule.",
    );
  }

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
      getCalendarDateKey(d, centerTimeZone) >=
        calendarMonthStart.toISOString().slice(0, 10) &&
      getCalendarDateKey(d, centerTimeZone) <=
        calendarMonthEnd.toISOString().slice(0, 10)
    ) {
      const key = getEnrollmentWeekKey(s.enrollmentId, d, centerTimeZone);
      plannedPerEnrollmentWeek.set(
        key,
        (plannedPerEnrollmentWeek.get(key) ?? 0) + 1,
      );
    }
  }

  const virtual: VirtualSession[] = [];

  for (const rule of rules) {
    const { enrollment } = rule;
    if (!enrollment || !rule.enrollmentId) continue;
    const sessionsPerWeek = enrollment.package.sessionsPerWeek ?? null;

    let current = getFirstMatchingDate(new Date(rule.startsOn), rule.dayOfWeek);

    // Advance to the month window
    while (current < calendarMonthStart) {
      current = addCalendarDays(current, rule.intervalWeeks * 7);
    }

    while (current <= calendarMonthEnd) {
      if (rule.endsOn && current > new Date(rule.endsOn)) break;
      if (!isEnrollmentEligibleOnCalendarDate(enrollment, current)) {
        if (enrollment.endDate && current > enrollment.endDate) break;
        current = addCalendarDays(current, rule.intervalWeeks * 7);
        continue;
      }

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
            scheduledFor.getTime(),
      );

      if (!hasReal) {
        // Past slots should have been materialized already; skip them here
        if (!includePast && isBefore(scheduledFor, today)) {
          current = addCalendarDays(current, rule.intervalWeeks * 7);
          continue;
        }

        const weekKey = getEnrollmentWeekKey(
          rule.enrollmentId,
          scheduledFor,
          centerTimeZone,
        );
        const weekCount = plannedPerEnrollmentWeek.get(weekKey) ?? 0;
        const status: VirtualSession["status"] =
          sessionsPerWeek !== null && weekCount >= sessionsPerWeek
            ? "VIRTUAL_DEPLETED"
            : "VIRTUAL_UPCOMING";

        assertVirtualSessionCapacity(virtual.length, safetyLimits);
        virtual.push({
          id: `virtual_${rule.id}_${format(scheduledFor, "yyyyMMddHHmm")}`,
          scheduledFor: scheduledFor.toISOString(),
          durationMinutes: rule.durationMinutes,
          status,
          room: rule.room,
          color: rule.color ?? null,
          tutor: {
            id: enrollment.tutor.id,
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
  const groupRules = await getGroupRecurrenceRulesForMonth(
    calendarMonthStart,
    calendarMonthEnd,
    safetyLimits,
  );
  if (safetyLimits && groupRules.length > safetyLimits.rules) {
    throw new Error(
      "The schedule exceeds the 1,000-group-recurrence-rule assistant safety bound. Narrow the request to an exact group or rule.",
    );
  }

  for (const rule of groupRules) {
    if (!rule.group) continue;
    if (
      safetyLimits &&
      rule.group.enrollments.length > safetyLimits.groupEnrollments
    ) {
      throw new Error(
        "A recurring group exceeds the 100-member assistant safety bound. Open the group record to inspect its schedule.",
      );
    }

    let current = getFirstMatchingDate(new Date(rule.startsOn), rule.dayOfWeek);
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
      const eligibleEnrollments = rule.group.enrollments.filter((enrollment) =>
        isEnrollmentEligibleForSession(enrollment, scheduledFor, rule.timeZone),
      );
      if (eligibleEnrollments.length === 0) {
        current = addCalendarDays(current, rule.intervalWeeks * 7);
        continue;
      }

      const hasReal = realSessions.some(
        (s) =>
          s.recurrenceRuleId === rule.id &&
          new Date(s.recurrenceOccurrenceFor ?? s.scheduledFor).getTime() ===
            scheduledFor.getTime(),
      );

      if (!hasReal && (includePast || !isBefore(scheduledFor, today))) {
        assertVirtualSessionCapacity(virtual.length, safetyLimits);
        virtual.push({
          id: `virtual_${rule.id}_${format(scheduledFor, "yyyyMMddHHmm")}`,
          scheduledFor: scheduledFor.toISOString(),
          durationMinutes: rule.durationMinutes,
          status: "VIRTUAL_UPCOMING",
          room: rule.room,
          color: rule.color ?? null,
          tutor: {
            id: rule.group.tutor.id,
            firstName: rule.group.tutor.firstName,
            lastName: rule.group.tutor.lastName,
          },
          subject: { name: rule.group.subject.name },
          attendance: eligibleEnrollments.map((e) => ({
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
  prefetchedRules?: MonthRules,
): Promise<EnrollmentSessionSummary[]> {
  const centerTimeZone = getConfiguredCenterTimeZone();
  const daysSinceMonday = (monthStart.getUTCDay() + 6) % 7;
  const calendarWeekStart = addCalendarDays(monthStart, -daysSinceMonday);
  const weekStart = combineDateAndTime(
    calendarWeekStart,
    "00:00",
    centerTimeZone,
  );
  const weekEndExclusive = combineDateAndTime(
    addCalendarDays(calendarWeekStart, 7),
    "00:00",
    centerTimeZone,
  );
  const calendarMonthEnd = new Date(
    Date.UTC(monthStart.getUTCFullYear(), monthStart.getUTCMonth() + 1, 0),
  );
  const rules =
    prefetchedRules ??
    (await getRecurrenceRulesForMonth(monthStart, calendarMonthEnd));

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
        new Date(s.scheduledFor) < weekEndExclusive,
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
  input: MarkAttendanceInput,
) {
  const parsed = markAttendanceSchema.parse(input);

  const allStatuses = parsed.attendances.map((a) => a.status);
  const hasCompleted = allStatuses.some((s) => s === "COMPLETED");
  const allScheduled = allStatuses.every((s) => s === "SCHEDULED");
  const allNoShow = allStatuses.every((s) => s === "NO_SHOW");
  const allCancelledTutor = allStatuses.every(
    (s) => s === "CANCELLED_BY_TUTOR",
  );
  const allCancelledStudent = allStatuses.every(
    (s) => s === "CANCELLED_BY_STUDENT",
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
  const scheduledForChanged =
    data.scheduledFor !== undefined &&
    data.scheduledFor.getTime() !== new Date(session.scheduledFor).getTime();
  const durationChanged =
    data.durationMinutes !== undefined &&
    data.durationMinutes !== session.durationMinutes;
  if (scheduledForChanged) {
    const calendarDate = getCalendarDateInTimeZone(
      scheduledFor,
      getConfiguredCenterTimeZone(),
    );
    if (session.enrollment) {
      assertSessionDateWithinEnrollmentBounds(session.enrollment, calendarDate);
    }
    for (const attendance of session.attendance) {
      if (attendance.enrollment) {
        assertSessionDateWithinEnrollmentBounds(
          attendance.enrollment,
          calendarDate,
        );
      }
    }
  }
  const studentIds =
    session.attendance.length > 0
      ? session.attendance.map((attendance) => attendance.studentId)
      : session.enrollment
        ? [session.enrollment.studentId]
        : [];

  if (scheduledForChanged || durationChanged) {
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
  }

  return updateSessionData(sessionId, data);
}

export async function cancelSessionById(
  id: string,
  cancelledBy: "TUTOR" | "STUDENT",
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
  },
) {
  const rule = await getRecurrenceRuleWithParticipants(ruleId);
  if (!rule) throw new Error("Recurrence rule not found");

  const splitDay = getCalendarDateInTimeZone(splitDate, rule.timeZone);
  const ruleStart = new Date(rule.startsOn);
  if (rule.enrollment) {
    assertEnrollmentEligibleOnCalendarDate(rule.enrollment, splitDay);
  }
  const effectiveEndsOn =
    rule.enrollment?.endDate &&
    (!rule.endsOn || rule.enrollment.endDate < rule.endsOn)
      ? rule.enrollment.endDate
      : rule.endsOn;

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
    durationMinutes: newParams.durationMinutes ?? rule.durationMinutes,
    intervalWeeks: newParams.intervalWeeks ?? rule.intervalWeeks,
    startsOn: splitDay,
    endsOn: effectiveEndsOn ? new Date(effectiveEndsOn) : undefined,
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
    room: update.room === null ? undefined : update.room,
    color: rule.color ?? undefined,
    startsOn: splitDay,
    endsOn: effectiveEndsOn ? new Date(effectiveEndsOn) : undefined,
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

export async function getMonthSchedule(monthKey: string) {
  const centerTimeZone = getConfiguredCenterTimeZone();
  const range = getCalendarMonthRange(monthKey, centerTimeZone);

  // Materialize any past recurring slots so they show as real DB records
  const now = new Date();
  const rangeEnd = new Date(range.endExclusive.getTime() - 1);
  if (isBefore(range.start, now)) {
    const pastEnd = isBefore(rangeEnd, now) ? rangeEnd : now;
    await materializeSessions(range.start, pastEnd);
    await materializeGroupSessions(range.start, pastEnd);
  }

  const [realSessions, rules] = await Promise.all([
    getSessionsByMonth(range.start, range.endExclusive),
    getRecurrenceRulesForMonth(range.calendarStart, range.calendarEnd),
  ]);

  const enrollmentIds = [
    ...new Set([
      ...rules
        .map((r) => r.enrollmentId)
        .filter((id): id is string => id !== null),
      ...realSessions
        .filter((s) => s.enrollmentId != null)
        .map((s) => s.enrollmentId as string),
    ]),
  ];
  const subscriptionEnrollmentIds = new Set([
    ...rules
      .filter((rule) => rule.enrollment?.package.type === "MONTHLY")
      .map((rule) => rule.enrollmentId)
      .filter((id): id is string => id !== null),
    ...realSessions
      .filter((session) => session.enrollment?.package.type === "MONTHLY")
      .map((session) => session.enrollmentId)
      .filter((id): id is string => id !== null),
  ]);
  // Cover the calendar grid which may show days from adjacent months
  const months = [-1, 0, 1].map((offset) =>
    addCalendarMonths(range.calendarStart, offset).toISOString().slice(0, 7),
  );

  const [virtualSessions, summaries, paidMonthRecords] = await Promise.all([
    getVirtualSessionsForMonth(range.calendarStart, realSessions, rules),
    getEnrollmentSessionSummaries(range.calendarStart, realSessions, rules),
    getEnrollmentPaidMonths(enrollmentIds, months),
  ]);

  // "enrollmentId:yyyy-MM" → paid
  const paidMonths = new Set(
    paidMonthRecords
      .filter((p) => p.enrollmentId && p.coversMonth)
      .map((p) => `${p.enrollmentId}:${p.coversMonth}`),
  );

  return {
    realSessions,
    virtualSessions,
    summaries,
    paidMonths,
    subscriptionEnrollmentIds,
  };
}

export async function getMonthScheduleForAssistant(
  monthKey: string,
  limit = 100,
  page = 1,
) {
  const centerTimeZone = getConfiguredCenterTimeZone();
  const range = getCalendarMonthRange(monthKey, centerTimeZone);
  const [real, rules] = await Promise.all([
    getSessionsForAssistantMonth(
      range.start,
      range.endExclusive,
      limit,
      page,
    ),
    getRecurrenceRulesForMonth(
      range.calendarStart,
      range.calendarEnd,
      ASSISTANT_RECURRENCE_LIMITS.rules,
    ),
  ]);
  if (real.slotsTruncated) {
    throw new Error(
      "This month contains more than 5,000 materialized sessions. Narrow the request to an exact session ID.",
    );
  }
  const virtual = await getVirtualSessionsForMonth(
    range.calendarStart,
    real.slots,
    rules,
    false,
    ASSISTANT_RECURRENCE_LIMITS,
  );
  const summarizeSession = (session: (typeof real.sessions)[number]) => ({
    id: session.id,
    enrollmentId: session.enrollmentId,
    tutorId: session.tutorId,
    subjectId: session.subjectId,
    recurrenceRuleId: session.recurrenceRuleId,
    recurrenceOccurrenceFor: session.recurrenceOccurrenceFor,
    scheduledFor: session.scheduledFor,
    durationMinutes: session.durationMinutes,
    status: session.status,
    room: session.room,
    tutor: session.tutor,
    subject: session.subject,
    attendanceTotal: session._count.attendance,
    attendance: session.attendance,
  });
  const summarizeVirtual = (session: VirtualSession) => ({
    id: session.id,
    enrollmentId: session.enrollmentId,
    groupId: session.groupId,
    groupName: session.groupName,
    ruleId: session.ruleId,
    scheduledFor: session.scheduledFor,
    durationMinutes: session.durationMinutes,
    status: session.status,
    room: session.room,
    tutor: session.tutor,
    subject: session.subject,
    attendanceTotal: session.attendance.length,
    attendance: session.attendance.slice(0, 20),
    virtual: true as const,
  });
  return {
    month: monthKey,
    page,
    limit,
    realSessions: {
      total: real.total,
      hasMore: real.hasMore,
      results: real.sessions.map(summarizeSession),
    },
    virtualSessions: {
      total: virtual.length,
      hasMore: page * limit < virtual.length,
      results: virtual
        .slice((page - 1) * limit, page * limit)
        .map(summarizeVirtual),
    },
  };
}

export async function getDashboardScheduleForAssistant(limit = 50) {
  const timeZone = getConfiguredCenterTimeZone();
  const today = getCalendarDateInTimeZone(new Date(), timeZone);
  const tomorrow = addCalendarDays(today, 1);
  const dayAfterTomorrow = addCalendarDays(today, 2);
  const todayStart = combineDateAndTime(today, "00:00", timeZone);
  const tomorrowStart = combineDateAndTime(tomorrow, "00:00", timeZone);
  const dayAfterTomorrowStart = combineDateAndTime(
    dayAfterTomorrow,
    "00:00",
    timeZone,
  );
  const week = getCalendarWeekRange(new Date(), timeZone);
  const monthKeys = [
    ...new Set([
      today.toISOString().slice(0, 7),
      tomorrow.toISOString().slice(0, 7),
      week.calendarStart.toISOString().slice(0, 7),
      week.calendarEnd.toISOString().slice(0, 7),
    ]),
  ];

  const [todayReal, tomorrowReal, monthData] = await Promise.all([
    getSessionsForAssistantRange(todayStart, tomorrowStart, limit),
    getSessionsForAssistantRange(tomorrowStart, dayAfterTomorrowStart, limit),
    Promise.all(
      monthKeys.map(async (monthKey) => {
        const range = getCalendarMonthRange(monthKey, timeZone);
        const [slots, rules] = await Promise.all([
          getAssistantSessionSlots(range.start, range.endExclusive),
          getRecurrenceRulesForMonth(
            range.calendarStart,
            range.calendarEnd,
            ASSISTANT_RECURRENCE_LIMITS.rules,
          ),
        ]);
        if (slots.length > 5_000) {
          throw new Error(
            "The dashboard schedule exceeds the 5,000-session assistant safety bound.",
          );
        }
        const virtual = await getVirtualSessionsForMonth(
          range.calendarStart,
          slots,
          rules,
          true,
          ASSISTANT_RECURRENCE_LIMITS,
        );
        return { slots, virtual };
      }),
    ),
  ]);
  const virtualSessions = monthData.flatMap((month) => month.virtual);
  const inRange = (session: VirtualSession, start: Date, end: Date) => {
    const scheduledFor = new Date(session.scheduledFor);
    return scheduledFor >= start && scheduledFor < end;
  };
  const summarizeReal = (session: (typeof todayReal.sessions)[number]) => ({
    id: session.id,
    scheduledFor: session.scheduledFor,
    durationMinutes: session.durationMinutes,
    status: session.status,
    room: session.room,
    tutorName: `${session.tutor.firstName} ${session.tutor.lastName}`,
    subjectName: session.subject.name,
    attendanceTotal: session._count.attendance,
    students: session.attendance.map((attendance) => ({
      id: attendance.student.id,
      name: `${attendance.student.firstName} ${attendance.student.lastName}`,
    })),
  });
  const summarizeVirtual = (session: VirtualSession) => ({
    id: session.id,
    scheduledFor: session.scheduledFor,
    durationMinutes: session.durationMinutes,
    status: session.status,
    room: session.room,
    tutorName: `${session.tutor.firstName} ${session.tutor.lastName}`,
    subjectName: session.subject.name,
    attendanceTotal: session.attendance.length,
    students: session.attendance.slice(0, 10).map((attendance) => ({
      name: `${attendance.student.firstName} ${attendance.student.lastName}`,
    })),
    virtual: true as const,
  });
  const section = (
    real: typeof todayReal,
    virtual: VirtualSession[],
  ) => {
    const results = [
      ...real.sessions.map(summarizeReal),
      ...virtual.map(summarizeVirtual),
    ]
      .sort(
        (left, right) =>
          new Date(left.scheduledFor).getTime() -
          new Date(right.scheduledFor).getTime(),
      )
      .slice(0, limit);
    const total = real.total + virtual.length;
    return { total, hasMore: total > results.length, results };
  };

  const realWeek = monthData
    .flatMap((month) => month.slots)
    .filter((session) => {
      const scheduledFor = new Date(session.scheduledFor);
      return (
        scheduledFor >= week.start &&
        scheduledFor < week.endExclusive &&
        (session.status === "SCHEDULED" || session.status === "COMPLETED")
      );
    });
  const virtualWeek = virtualSessions.filter((session) =>
    inRange(session, week.start, week.endExclusive),
  );
  const weekSummary = summarizeAssistantWeekSchedule(
    [
      ...realWeek.map((session) => ({
        scheduledFor: session.scheduledFor,
        tutor: session.tutor,
      })),
      ...virtualWeek.map((session) => ({
        scheduledFor: session.scheduledFor,
        tutor: session.tutor,
      })),
    ],
    timeZone,
  );

  return {
    todaySessions: section(
      todayReal,
      virtualSessions.filter((session) =>
        inRange(session, todayStart, tomorrowStart),
      ),
    ),
    tomorrowSessions: section(
      tomorrowReal,
      virtualSessions.filter((session) =>
        inRange(session, tomorrowStart, dayAfterTomorrowStart),
      ),
    ),
    tutorCounts: weekSummary.tutorCounts,
    weeklySessionsByDay: weekSummary.weeklySessionsByDay,
  };
}

export async function updateEnrollmentRecurrenceColor(
  enrollmentId: string,
  color: string,
) {
  await updateRecurrenceRulesColorForEnrollment(enrollmentId, color);
}

export function getActiveRecurrenceRulesForEnrollment(enrollmentId: string) {
  const calendarDate = getCalendarDateInTimeZone(
    new Date(),
    getConfiguredCenterTimeZone(),
  );
  return getActiveRecurrenceRulesForEnrollmentData(enrollmentId, calendarDate);
}

export function getActiveRecurrenceRulesForGroup(groupId: string) {
  const calendarDate = getCalendarDateInTimeZone(
    new Date(),
    getConfiguredCenterTimeZone(),
  );
  return getActiveRecurrenceRulesForGroupData(groupId, calendarDate);
}

export function listRecurrenceRulesForAssistant(input: {
  enrollmentId?: string;
  groupId?: string;
  includeEnded: boolean;
  page: number;
  limit: number;
}) {
  const calendarDate = getCalendarDateInTimeZone(
    new Date(),
    getConfiguredCenterTimeZone(),
  );
  return listRecurrenceRulesForAssistantData({ ...input, calendarDate });
}

export {
  combineDateAndTime,
  getFirstMatchingDate,
} from "@/lib/services/session-dates";
export {
  materializeGroupSessions,
  materializeSessions,
} from "@/lib/services/session-materialization";
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
  getSession,
  getSessionsByMonth,
  getSessionsByWeek,
  updateSessionStatus,
} from "@/lib/data/sessions";
