import {
  addDays,
  format,
  startOfDay,
  startOfMonth,
  startOfWeek,
  endOfMonth,
  endOfWeek,
  isBefore,
  isSameDay,
  subMonths,
  addMonths,
} from "date-fns";
import { getEnrollmentPaidMonths } from "@/lib/data/payments";
import {
  createSession,
  createSessionAttendance,
  createRecurrenceRule,
  closeRecurrenceRule,
  deleteRecurrenceRule,
  deleteFutureSessionsForRecurrenceRule,
  detachSessionsFromRecurrenceRule,
  updateAttendance,
  cancelSession,
  deleteSession,
  getSessionsByMonth,
  getRecurrenceRuleById,
  getRecurrenceRulesForMonth,
  getGroupRecurrenceRulesForMonth,
  getNonCancelledEnrollmentSessionsInRange,
  autoCompletePassedSessions,
  updateRecurrenceRulesColorForEnrollment,
} from "@/lib/data/sessions";
import { getGroupWithMembers } from "@/lib/data/groups";
import { prisma } from "@/lib/prisma";
import {
  combineDateAndTime,
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
  const scheduledFor = new Date(input.scheduledFor);
  const duration = Number(input.durationMinutes);

  // Resolve group members if groupId is provided
  let sessionEnrollmentId: string | undefined = input.enrollmentId || undefined;
  let group: Awaited<ReturnType<typeof getGroupWithMembers>> | null = null;
  let studentIds = input.studentIds;

  if (input.groupId) {
    sessionEnrollmentId = undefined;
    group = await getGroupWithMembers(input.groupId);
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
    tutorId: input.tutorId,
    subjectId: input.subjectId,
    studentIds,
    scheduledFor,
    durationMinutes: duration,
  });

  const session = await createSession({
    enrollmentId: sessionEnrollmentId,
    tutorId: input.tutorId,
    subjectId: input.subjectId,
    scheduledFor,
    durationMinutes: duration,
    room: input.room || undefined,
    notes: input.notes || undefined,
  });

  if (input.groupId) {
    for (const enrollment of group!.enrollments) {
      await createSessionAttendance({
        sessionId: session.id,
        studentId: enrollment.studentId,
        enrollmentId: enrollment.id,
      });
    }
  } else {
    const enrollment = sessionEnrollmentId
      ? await prisma.enrollment.findUnique({ where: { id: sessionEnrollmentId } })
      : null;
    for (const studentId of studentIds) {
      await createSessionAttendance({
        sessionId: session.id,
        studentId,
        enrollmentId: enrollment?.id,
      });
    }
  }

  return session;
}

// ─── Recurring schedule — store rules only, no pre-generated sessions ─────────

export async function createRecurringSchedule(input: CreateRecurrenceInput) {
  const preview = await getRecurringSchedulePreview(input);
  if (!input.groupId && preview.firstExceededDate && !input.endsOn) {
    throw new Error(
      "This recurrence exceeds the package limit. Add an end date or adjust the pattern before creating it."
    );
  }

  const daysOfWeek = input.daysOfWeek.map(Number);
  const duration = Number(input.durationMinutes);
  const intervalWeeks = input.intervalWeeks ? Number(input.intervalWeeks) : 1;
  const startsOn = new Date(input.startsOn);
  const endsOn = input.endsOn ? new Date(input.endsOn) : undefined;

  let ruleEnrollmentId: string | undefined;
  let ruleGroupId: string | undefined;
  let ruleColor = input.color;
  let scheduleTutorId: string;
  let scheduleSubjectId: string;
  let scheduleStudents: ConflictStudent[];

  if (input.groupId) {
    ruleGroupId = input.groupId;
    const group = await getGroupWithMembers(input.groupId);
    if (!group) throw new Error("Group not found");
    scheduleTutorId = group.tutorId;
    scheduleSubjectId = group.subjectId;
    scheduleStudents = group.enrollments.map((enrollment) => enrollment.student);
    ruleColor = ruleColor ?? hashEnrollmentColor(input.groupId);
  } else {
    ruleEnrollmentId = input.enrollmentId;
    const enrollment = await prisma.enrollment.findUnique({
      where: { id: input.enrollmentId },
      include: { student: true },
    });
    if (!enrollment) throw new Error("Enrollment not found");
    scheduleTutorId = enrollment.tutorId;
    scheduleSubjectId = enrollment.subjectId;
    scheduleStudents = [enrollment.student];
    ruleColor = ruleColor ?? hashEnrollmentColor(input.enrollmentId!);
  }

  await assertNoRecurringScheduleConflict({
    tutorId: scheduleTutorId,
    subjectId: scheduleSubjectId,
    students: scheduleStudents,
    daysOfWeek,
    startTime: input.startTime,
    startTimes: input.startTimes,
    durationMinutes: duration,
    intervalWeeks,
    startsOn,
    endsOn,
  });

  const rules = [];
  for (const dayOfWeek of daysOfWeek) {
    const rule = await createRecurrenceRule({
      enrollmentId: ruleEnrollmentId,
      groupId: ruleGroupId,
      dayOfWeek,
      startTime: input.startTimes?.[String(dayOfWeek)] ?? input.startTime,
      durationMinutes: duration,
      intervalWeeks,
      room: input.room || undefined,
      color: ruleColor,
      startsOn,
      endsOn,
    });
    rules.push(rule);
  }

  const now = new Date();
  if (isBefore(startsOn, now)) {
    await materializeSessions(startsOn, now, {
      recurrenceRuleIds: rules.map((r) => r.id),
    });
    await materializeGroupSessions(startsOn, now, {
      recurrenceRuleIds: rules.map((r) => r.id),
    });
    await autoCompletePassedSessions();
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
};

type MonthRules = Awaited<ReturnType<typeof getRecurrenceRulesForMonth>>;

export async function getVirtualSessionsForMonth(
  monthStart: Date,
  realSessions: RealSessionSlim[],
  prefetchedRules?: MonthRules
): Promise<VirtualSession[]> {
  const monthEnd = endOfMonth(monthStart);
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
    if (d >= startOfMonth(monthStart) && d <= monthEnd) {
      const key = getEnrollmentWeekKey(s.enrollmentId, d);
      plannedPerEnrollmentWeek.set(key, (plannedPerEnrollmentWeek.get(key) ?? 0) + 1);
    }
  }

  const virtual: VirtualSession[] = [];

  for (const rule of rules) {
    const { enrollment } = rule;
    if (!enrollment || !rule.enrollmentId) continue;
    const sessionsPerWeek = enrollment.package.sessionsPerWeek ?? null;

    // Find first occurrence of dayOfWeek at or after rule.startsOn
    let current = new Date(rule.startsOn);
    while (current.getDay() !== rule.dayOfWeek) {
      current = addDays(current, 1);
    }

    // Advance to the month window
    while (current < monthStart) {
      current = addDays(current, rule.intervalWeeks * 7);
    }

    while (current <= monthEnd) {
      if (rule.endsOn && current > new Date(rule.endsOn)) break;

      const scheduledFor = combineDateAndTime(current, rule.startTime);

      // Skip if a real session already covers this slot.
      // A rescheduled real session links back via recurrenceRuleId, suppressing
      // the virtual slot even when the hour differs.
      const hasReal = realSessions.some(
        (s) =>
          s.enrollmentId === rule.enrollmentId &&
          isSameDay(new Date(s.scheduledFor), scheduledFor) &&
          (s.recurrenceRuleId === rule.id ||
            new Date(s.scheduledFor).getHours() === scheduledFor.getHours())
      );

      if (!hasReal) {
        // Past slots should have been materialized already; skip them here
        if (isBefore(scheduledFor, today)) {
          current = addDays(current, rule.intervalWeeks * 7);
          continue;
        }

        const weekKey = getEnrollmentWeekKey(rule.enrollmentId, scheduledFor);
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

      current = addDays(current, rule.intervalWeeks * 7);
    }
  }

  // ─── Group virtual sessions ────────────────────────────────────────────────
  const groupRules = await getGroupRecurrenceRulesForMonth(monthStart);

  for (const rule of groupRules) {
    if (!rule.group) continue;

    let current = new Date(rule.startsOn);
    while (current.getDay() !== rule.dayOfWeek) {
      current = addDays(current, 1);
    }
    while (current < monthStart) {
      current = addDays(current, rule.intervalWeeks * 7);
    }

    while (current <= monthEnd) {
      if (rule.endsOn && current > new Date(rule.endsOn)) break;

      const scheduledFor = combineDateAndTime(current, rule.startTime);

      const hasReal = realSessions.some(
        (s) =>
          s.recurrenceRuleId === rule.id &&
          isSameDay(new Date(s.scheduledFor), scheduledFor),
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

      current = addDays(current, rule.intervalWeeks * 7);
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

// ─── Sessions remaining for a specific enrollment + month ────────────────────

export type EnrollmentMonthSummary = {
  sessionsPerWeek: number | null;
  totalPlanned: number;
  remaining: number | null;
  periodLabel: string;
  isOverLimit: boolean;
};

export type RecurringSchedulePreview = {
  hasLimit: boolean;
  sessionsPerWeek: number | null;
  proposedSessions: number;
  materializableSessions: number;
  firstExceededDate: string | null;
  suggestedEndsOn: string | null;
  periodLabel: string | null;
  existingPlannedInWeek: number;
};

async function assertEnrollmentHasMonthlyCapacity(
  enrollmentId: string | undefined,
  date: Date,
  additionalSessions = 1
) {
  if (!enrollmentId) return;

  const summary = await getEnrollmentMonthSummary(enrollmentId, date);
  if (
    summary.sessionsPerWeek !== null &&
    summary.totalPlanned + additionalSessions > summary.sessionsPerWeek
  ) {
    throw new Error(
      `${summary.periodLabel} package limit reached: ${summary.totalPlanned}/${summary.sessionsPerWeek} sessions are already planned`
    );
  }
}

export async function getRecurringSchedulePreview(
  input: CreateRecurrenceInput,
  fromDate = new Date(),
  toDate = addDays(fromDate, 30)
): Promise<RecurringSchedulePreview> {
  // Group schedules have no package-level session limit to preview
  if (input.groupId) {
    return {
      hasLimit: false,
      sessionsPerWeek: null,
      proposedSessions: input.daysOfWeek.length,
      materializableSessions: input.daysOfWeek.length,
      firstExceededDate: null,
      suggestedEndsOn: null,
      periodLabel: null,
      existingPlannedInWeek: 0,
    };
  }

  const enrollmentId = input.enrollmentId!;

  const enrollment = await prisma.enrollment.findUnique({
    where: { id: enrollmentId },
    include: { package: true },
  });
  if (!enrollment) throw new Error("Enrollment not found");

  const sessionsPerWeek = enrollment.package.sessionsPerWeek ?? null;
  const daysOfWeek = input.daysOfWeek.map(Number);
  const intervalWeeks = input.intervalWeeks ? Number(input.intervalWeeks) : 1;
  const startsOn = new Date(input.startsOn);
  const endsOn = input.endsOn ? new Date(input.endsOn) : undefined;
  const windowStart = startsOn > fromDate ? startsOn : fromDate;
  const windowEnd = endsOn && endsOn < toDate ? endsOn : toDate;

  const existingSessions = await getNonCancelledEnrollmentSessionsInRange(
    [enrollmentId],
    startOfWeek(windowStart, { weekStartsOn: 1 }),
    endOfWeek(windowEnd, { weekStartsOn: 1 })
  );
  const weeklyCounts = new Map<string, number>();
  for (const session of existingSessions) {
    if (!session.enrollmentId) continue;
    const key = getEnrollmentWeekKey(session.enrollmentId, new Date(session.scheduledFor));
    weeklyCounts.set(key, (weeklyCounts.get(key) ?? 0) + 1);
  }

  const occurrences: Date[] = [];
  for (const dayOfWeek of daysOfWeek) {
    let current = getFirstMatchingDate(windowStart, dayOfWeek);
    while (current <= windowEnd) {
      if (endsOn && current > endsOn) break;
      occurrences.push(combineDateAndTime(current, input.startTime));
      current = addDays(current, intervalWeeks * 7);
    }
  }
  occurrences.sort((a, b) => a.getTime() - b.getTime());

  let materializableSessions = 0;
  let firstExceededDate: Date | null = null;
  let existingPlannedInExceededWeek = 0;

  for (const scheduledFor of occurrences) {
    const weekKey = getEnrollmentWeekKey(enrollmentId, scheduledFor);
    const currentCount = weeklyCounts.get(weekKey) ?? 0;
    if (sessionsPerWeek !== null && currentCount >= sessionsPerWeek) {
      firstExceededDate = scheduledFor;
      existingPlannedInExceededWeek = currentCount;
      break;
    }

    materializableSessions++;
    weeklyCounts.set(weekKey, currentCount + 1);
  }

  return {
    hasLimit: sessionsPerWeek !== null,
    sessionsPerWeek,
    proposedSessions: occurrences.length,
    materializableSessions,
    firstExceededDate: firstExceededDate?.toISOString() ?? null,
    suggestedEndsOn: firstExceededDate
      ? format(addDays(startOfDay(firstExceededDate), -1), "yyyy-MM-dd")
      : null,
    periodLabel: firstExceededDate
      ? `week of ${format(startOfWeek(firstExceededDate, { weekStartsOn: 1 }), "MMM d")}`
      : null,
    existingPlannedInWeek: existingPlannedInExceededWeek,
  };
}

export async function getEnrollmentMonthSummary(
  enrollmentId: string,
  date: Date
): Promise<EnrollmentMonthSummary> {
  const weekStart = startOfWeek(date, { weekStartsOn: 1 });
  const weekEnd = endOfWeek(date, { weekStartsOn: 1 });
  const today = new Date();

  const enrollment = await prisma.enrollment.findUnique({
    where: { id: enrollmentId },
    include: { package: true },
  });

  if (!enrollment) {
    return {
      sessionsPerWeek: null,
      totalPlanned: 0,
      remaining: null,
      periodLabel: `Week of ${format(weekStart, "MMM d")}`,
      isOverLimit: false,
    };
  }

  const sessionsPerWeek = enrollment.package.sessionsPerWeek ?? null;

  // Count non-cancelled real sessions this week
  const realCount = await prisma.session.count({
    where: {
      enrollmentId,
      status: { notIn: ["CANCELLED_BY_TUTOR", "CANCELLED_BY_STUDENT"] },
      scheduledFor: { gte: weekStart, lte: weekEnd },
    },
  });

  // Count upcoming virtual sessions this week (from recurrence rules)
  const rules = await prisma.recurrenceRule.findMany({
    where: {
      enrollmentId,
      startsOn: { lte: weekEnd },
      OR: [{ endsOn: null }, { endsOn: { gte: weekStart } }],
    },
  });

  const realForDedup = await prisma.session.findMany({
    where: { enrollmentId, scheduledFor: { gte: weekStart, lte: weekEnd } },
    select: { scheduledFor: true, enrollmentId: true },
  });

  let virtualCount = 0;
  for (const rule of rules) {
    let current = new Date(rule.startsOn);
    while (current.getDay() !== rule.dayOfWeek) current = addDays(current, 1);
    while (current < weekStart) current = addDays(current, rule.intervalWeeks * 7);

    while (current <= weekEnd) {
      if (rule.endsOn && current > new Date(rule.endsOn)) break;
      const scheduledFor = combineDateAndTime(current, rule.startTime);

      if (scheduledFor > today) {
        const hasReal = realForDedup.some(
          (s) =>
            isSameDay(new Date(s.scheduledFor), scheduledFor) &&
            new Date(s.scheduledFor).getHours() === scheduledFor.getHours()
        );
        if (!hasReal) virtualCount++;
      }
      current = addDays(current, rule.intervalWeeks * 7);
    }
  }

  const totalPlanned = realCount + virtualCount;
  const remaining =
    sessionsPerWeek !== null ? Math.max(0, sessionsPerWeek - totalPlanned) : null;

  return {
    sessionsPerWeek,
    totalPlanned,
    remaining,
    periodLabel: `Week of ${format(weekStart, "MMM d")}`,
    isOverLimit: sessionsPerWeek !== null && totalPlanned >= sessionsPerWeek,
  };
}

// ─── Attendance & status ──────────────────────────────────────────────────────

export async function markSessionAttendance(
  sessionId: string,
  input: MarkAttendanceInput
) {
  await updateAttendance(sessionId, input.attendances);

  const allStatuses = input.attendances.map((a) => a.status);
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

  await prisma.session.update({
    where: { id: sessionId },
    data: { status: sessionStatus },
  });
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
  const rule = await prisma.recurrenceRule.findUnique({ where: { id: ruleId } });
  if (!rule) throw new Error("Recurrence rule not found");

  const splitDay = startOfDay(splitDate);
  const ruleStart = startOfDay(new Date(rule.startsOn));

  // If the rule is already closed before the split date, nothing to do
  if (rule.endsOn && startOfDay(new Date(rule.endsOn)) < splitDay) {
    return rule;
  }

  // Delete future sessions for this rule from splitDay onward — they'll be
  // re-materialized with the new params (fixes stale sessions after time change)
  await deleteFutureSessionsForRecurrenceRule(ruleId, splitDay);

  // If split is at or before the rule's own start, just update it in place
  if (splitDay <= ruleStart) {
    return prisma.recurrenceRule.update({
      where: { id: ruleId },
      data: {
        startTime: newParams.startTime ?? rule.startTime,
        durationMinutes: newParams.durationMinutes ?? rule.durationMinutes,
        room: newParams.room !== undefined ? newParams.room : rule.room,
        intervalWeeks: newParams.intervalWeeks ?? rule.intervalWeeks,
        dayOfWeek: newParams.dayOfWeek ?? rule.dayOfWeek,
      },
    });
  }

  // Close old rule the day before the split
  await closeRecurrenceRule(ruleId, addDays(splitDay, -1));

  // Create new rule from split date forward
  return createRecurrenceRule({
    enrollmentId: rule.enrollmentId ?? undefined,
    groupId: rule.groupId ?? undefined,
    dayOfWeek: newParams.dayOfWeek ?? rule.dayOfWeek,
    startTime: newParams.startTime ?? rule.startTime,
    durationMinutes: newParams.durationMinutes ?? rule.durationMinutes,
    intervalWeeks: newParams.intervalWeeks ?? rule.intervalWeeks,
    room:
      newParams.room !== undefined
        ? newParams.room ?? undefined
        : rule.room ?? undefined,
    color: rule.color ?? undefined,
    startsOn: splitDay,
    endsOn: rule.endsOn ? new Date(rule.endsOn) : undefined,
  });
}

export async function endRecurrenceFromDate(ruleId: string, fromDate: Date) {
  // Ends the recurrence BEFORE the given date (i.e., last occurrence is the day before)
  await closeRecurrenceRule(ruleId, addDays(startOfDay(fromDate), -1));
}

export async function deleteRecurringSchedule(ruleId: string) {
  const rule = await getRecurrenceRuleById(ruleId);
  if (!rule) throw new Error("Recurrence rule not found");

  await deleteFutureSessionsForRecurrenceRule(ruleId, new Date());
  await detachSessionsFromRecurrenceRule(ruleId);
  return deleteRecurrenceRule(ruleId);
}

export async function cancelVirtualOccurrence(ruleId: string, date: Date) {
  const rule = await prisma.recurrenceRule.findUnique({
    where: { id: ruleId },
    include: { enrollment: true },
  });
  if (!rule) throw new Error("Recurrence rule not found");
  if (!rule.enrollment) throw new Error("Recurrence rule has no enrollment");

  const scheduledFor = combineDateAndTime(startOfDay(date), rule.startTime);

  const session = await createSession({
    enrollmentId: rule.enrollmentId ?? undefined,
    tutorId: rule.enrollment.tutorId,
    subjectId: rule.enrollment.subjectId,
    scheduledFor,
    durationMinutes: rule.durationMinutes,
    room: rule.room ?? undefined,
    recurrenceRuleId: ruleId,
  });

  await createSessionAttendance({
    sessionId: session.id,
    studentId: rule.enrollment.studentId,
    enrollmentId: rule.enrollmentId ?? undefined,
  });

  // Mark immediately as cancelled
  await prisma.session.update({
    where: { id: session.id },
    data: { status: "CANCELLED_BY_TUTOR" },
  });

  return session;
}

export async function rescheduleVirtualOccurrence(
  ruleId: string,
  newScheduledFor: Date,
  overrides: { durationMinutes?: number; room?: string | null }
) {
  const rule = await prisma.recurrenceRule.findUnique({
    where: { id: ruleId },
    include: { enrollment: true },
  });
  if (!rule) throw new Error("Recurrence rule not found");
  if (!rule.enrollment) throw new Error("Recurrence rule has no enrollment");

  const session = await createSession({
    enrollmentId: rule.enrollmentId ?? undefined,
    tutorId: rule.enrollment.tutorId,
    subjectId: rule.enrollment.subjectId,
    scheduledFor: newScheduledFor,
    durationMinutes: overrides.durationMinutes ?? rule.durationMinutes,
    room:
      overrides.room !== undefined
        ? overrides.room ?? undefined
        : rule.room ?? undefined,
    recurrenceRuleId: ruleId,
  });

  await createSessionAttendance({
    sessionId: session.id,
    studentId: rule.enrollment.studentId,
    enrollmentId: rule.enrollmentId ?? undefined,
  });

  return session;
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
    await autoCompletePassedSessions();
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
  autoCompletePassedSessions,
  getActiveRecurrenceRulesForGroup,
  getSession,
  getSessionsByMonth,
  getSessionsByWeek,
} from "@/lib/data/sessions";
