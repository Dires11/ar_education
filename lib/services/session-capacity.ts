import "server-only";

import {
  addDays,
  format,
} from "date-fns";
import { TZDate } from "@date-fns/tz";
import {
  getEnrollmentForSession,
  getEnrollmentWeekScheduleData,
  getNonCancelledEnrollmentSessionsInRange,
} from "@/lib/data/sessions";
import {
  addCalendarDays,
  combineDateAndTime,
  getCalendarDateInTimeZone,
  getCalendarWeekRange,
  getCalendarWeekRangeFromCalendarDate,
  getEnrollmentWeekKey,
  getFirstRecurrenceOnOrAfter,
  getConfiguredCenterTimeZone,
} from "@/lib/services/session-dates";
import {
  createRecurrenceSchema,
  type CreateRecurrenceInput,
} from "@/lib/validators/sessions";

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

export async function assertEnrollmentHasMonthlyCapacity(
  enrollmentId: string | undefined,
  date: Date,
  additionalSessions = 1,
) {
  if (!enrollmentId) return;

  const summary = await getEnrollmentMonthSummary(enrollmentId, date);
  if (
    summary.sessionsPerWeek !== null &&
    summary.totalPlanned + additionalSessions > summary.sessionsPerWeek
  ) {
    throw new Error(
      `${summary.periodLabel} package limit reached: ${summary.totalPlanned}/${summary.sessionsPerWeek} sessions are already planned`,
    );
  }
}

export async function getRecurringSchedulePreview(
  input: CreateRecurrenceInput,
  fromDate = new Date(),
  toDate = addDays(fromDate, 30),
): Promise<RecurringSchedulePreview> {
  const parsed = createRecurrenceSchema.parse(input);
  if (parsed.groupId) {
    return {
      hasLimit: false,
      sessionsPerWeek: null,
      proposedSessions: parsed.daysOfWeek.length,
      materializableSessions: parsed.daysOfWeek.length,
      firstExceededDate: null,
      suggestedEndsOn: null,
      periodLabel: null,
      existingPlannedInWeek: 0,
    };
  }

  const enrollmentId = parsed.enrollmentId!;
  const enrollment = await getEnrollmentForSession(enrollmentId);
  if (!enrollment) throw new Error("Enrollment not found");

  const sessionsPerWeek = enrollment.package.sessionsPerWeek ?? null;
  const daysOfWeek = parsed.daysOfWeek.map(Number);
  const intervalWeeks = parsed.intervalWeeks
    ? Number(parsed.intervalWeeks)
    : 1;
  const startsOn = new Date(parsed.startsOn);
  const endsOn = parsed.endsOn ? new Date(parsed.endsOn) : undefined;
  const timeZone = getConfiguredCenterTimeZone();
  const today = getCalendarDateInTimeZone(fromDate, timeZone);
  const previewEnd = getCalendarDateInTimeZone(toDate, timeZone);
  const windowStart = startsOn > today ? startsOn : today;
  const windowEnd = endsOn && endsOn < previewEnd ? endsOn : previewEnd;
  const firstWeek = getCalendarWeekRangeFromCalendarDate(
    windowStart,
    timeZone,
  );
  const lastWeek = getCalendarWeekRangeFromCalendarDate(
    windowEnd,
    timeZone,
  );

  const existingSessions = await getNonCancelledEnrollmentSessionsInRange(
    [enrollmentId],
    firstWeek.start,
    lastWeek.endExclusive,
  );
  const weeklyCounts = new Map<string, number>();
  for (const session of existingSessions) {
    if (!session.enrollmentId) continue;
    const key = getEnrollmentWeekKey(
      session.enrollmentId,
      new Date(session.scheduledFor),
      timeZone,
    );
    weeklyCounts.set(key, (weeklyCounts.get(key) ?? 0) + 1);
  }

  const occurrences: Date[] = [];
  for (const dayOfWeek of daysOfWeek) {
    const dayKey = String(dayOfWeek) as
      | "0"
      | "1"
      | "2"
      | "3"
      | "4"
      | "5"
      | "6";
    let current = getFirstRecurrenceOnOrAfter(
      startsOn,
      dayOfWeek,
      intervalWeeks,
      windowStart,
    );
    while (current <= windowEnd) {
      if (endsOn && current > endsOn) break;
      occurrences.push(
        combineDateAndTime(
          current,
          parsed.startTimes?.[dayKey] ?? parsed.startTime,
          timeZone,
        ),
      );
      current = addCalendarDays(current, intervalWeeks * 7);
    }
  }
  occurrences.sort((a, b) => a.getTime() - b.getTime());

  let materializableSessions = 0;
  let firstExceededDate: Date | null = null;
  let existingPlannedInExceededWeek = 0;

  for (const scheduledFor of occurrences) {
    const weekKey = getEnrollmentWeekKey(
      enrollmentId,
      scheduledFor,
      timeZone,
    );
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
      ? addCalendarDays(
          getCalendarDateInTimeZone(firstExceededDate, timeZone),
          -1,
        )
          .toISOString()
          .slice(0, 10)
      : null,
    periodLabel: firstExceededDate
      ? `week of ${format(
          new TZDate(
            getCalendarWeekRange(firstExceededDate, timeZone).start,
            timeZone,
          ),
          "MMM d",
        )}`
      : null,
    existingPlannedInWeek: existingPlannedInExceededWeek,
  };
}

export async function getEnrollmentMonthSummary(
  enrollmentId: string,
  date: Date,
): Promise<EnrollmentMonthSummary> {
  const timeZone = getConfiguredCenterTimeZone();
  const week = getCalendarWeekRange(date, timeZone);
  const today = new Date();
  const enrollment = await getEnrollmentForSession(enrollmentId);

  if (!enrollment) {
    return {
      sessionsPerWeek: null,
      totalPlanned: 0,
      remaining: null,
      periodLabel: `Week of ${format(
        new TZDate(week.start, timeZone),
        "MMM d",
      )}`,
      isOverLimit: false,
    };
  }

  const sessionsPerWeek = enrollment.package.sessionsPerWeek ?? null;
  const { realCount, rules, realForDedup } =
    await getEnrollmentWeekScheduleData(
      enrollmentId,
      week.start,
      week.endExclusive,
    );

  let virtualCount = 0;
  for (const rule of rules) {
    const calendarWeekStart = getCalendarDateInTimeZone(
      week.start,
      rule.timeZone,
    );
    const calendarWeekEnd = getCalendarDateInTimeZone(
      new Date(week.endExclusive.getTime() - 1),
      rule.timeZone,
    );
    let current = getFirstRecurrenceOnOrAfter(
      new Date(rule.startsOn),
      rule.dayOfWeek,
      rule.intervalWeeks,
      calendarWeekStart,
    );

    while (current <= calendarWeekEnd) {
      if (rule.endsOn && current > new Date(rule.endsOn)) break;
      const scheduledFor = combineDateAndTime(
        current,
        rule.startTime,
        rule.timeZone,
      );
      if (scheduledFor > today) {
        const hasReal = realForDedup.some(
          (session) =>
            session.recurrenceRuleId === rule.id &&
            new Date(
              session.recurrenceOccurrenceFor ?? session.scheduledFor,
            ).getTime() === scheduledFor.getTime(),
        );
        if (!hasReal) virtualCount++;
      }
      current = addCalendarDays(current, rule.intervalWeeks * 7);
    }
  }

  const totalPlanned = realCount + virtualCount;
  const remaining =
    sessionsPerWeek !== null
      ? Math.max(0, sessionsPerWeek - totalPlanned)
      : null;

  return {
    sessionsPerWeek,
    totalPlanned,
    remaining,
    periodLabel: `Week of ${format(
      new TZDate(week.start, timeZone),
      "MMM d",
    )}`,
    isOverLimit: sessionsPerWeek !== null && totalPlanned >= sessionsPerWeek,
  };
}
