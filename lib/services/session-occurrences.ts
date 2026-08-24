import "server-only";

import {
  createSessionWithAttendances,
  getRecurrenceRuleWithParticipants,
} from "@/lib/data/sessions";
import {
  combineDateAndTime,
  getCalendarDateInTimeZone,
  getFirstMatchingDate,
} from "@/lib/services/session-dates";
import { assertNoScheduleConflict } from "@/lib/services/session-conflicts";
import {
  assertEnrollmentEligibleForSession,
  isEnrollmentEligibleForSession,
} from "@/lib/services/enrollment-schedule-dates";

type RecurrenceWithParticipants = NonNullable<
  Awaited<ReturnType<typeof getRecurrenceRuleWithParticipants>>
>;

function getCanonicalOccurrence(
  rule: RecurrenceWithParticipants,
  suppliedOccurrence: Date,
) {
  const calendarDate = getCalendarDateInTimeZone(
    suppliedOccurrence,
    rule.timeZone,
  );
  const firstOccurrence = getFirstMatchingDate(
    new Date(rule.startsOn),
    rule.dayOfWeek,
  );
  const daysFromStart = Math.round(
    (calendarDate.getTime() - firstOccurrence.getTime()) / 86_400_000,
  );

  if (
    daysFromStart < 0 ||
    daysFromStart % (rule.intervalWeeks * 7) !== 0 ||
    (rule.endsOn && calendarDate > new Date(rule.endsOn))
  ) {
    throw new Error("That date is not an occurrence of this recurrence rule.");
  }

  return combineDateAndTime(calendarDate, rule.startTime, rule.timeZone);
}

function getRecurrenceTarget(
  rule: RecurrenceWithParticipants,
  scheduledFor: Date,
) {
  if (rule.enrollment) {
    assertEnrollmentEligibleForSession(
      rule.enrollment,
      scheduledFor,
      rule.timeZone,
    );
    return {
      tutorId: rule.enrollment.tutorId,
      subjectId: rule.enrollment.subjectId,
      attendances: [
        {
          studentId: rule.enrollment.studentId,
          enrollmentId: rule.enrollment.id,
        },
      ],
    };
  }

  if (rule.group) {
    const eligibleEnrollments = rule.group.enrollments.filter((enrollment) =>
      isEnrollmentEligibleForSession(enrollment, scheduledFor, rule.timeZone),
    );
    if (eligibleEnrollments.length === 0) {
      throw new Error("This group has no active enrollments on that date.");
    }
    return {
      tutorId: rule.group.tutorId,
      subjectId: rule.group.subjectId,
      attendances: eligibleEnrollments.map((enrollment) => ({
        studentId: enrollment.studentId,
        enrollmentId: enrollment.id,
      })),
    };
  }

  throw new Error("Recurrence rule has no enrollment or group.");
}

export async function cancelVirtualOccurrence(
  ruleId: string,
  date: Date,
  expectedUpdatedAt?: Date,
) {
  const rule = await getRecurrenceRuleWithParticipants(ruleId);
  if (!rule) throw new Error("Recurrence rule not found");

  const recurrenceOccurrenceFor = getCanonicalOccurrence(rule, date);
  const target = getRecurrenceTarget(rule, recurrenceOccurrenceFor);
  return createSessionWithAttendances(
    {
      enrollmentId: rule.enrollmentId ?? undefined,
      tutorId: target.tutorId,
      subjectId: target.subjectId,
      scheduledFor: recurrenceOccurrenceFor,
      recurrenceOccurrenceFor,
      durationMinutes: rule.durationMinutes,
      room: rule.room ?? undefined,
      recurrenceRuleId: ruleId,
      status: "CANCELLED_BY_TUTOR",
    },
    target.attendances.map((attendance) => ({
      ...attendance,
      status: "CANCELLED_BY_TUTOR" as const,
      billable: false,
    })),
    expectedUpdatedAt ? { ruleId, updatedAt: expectedUpdatedAt } : undefined,
  );
}

export async function rescheduleVirtualOccurrence(
  ruleId: string,
  originalScheduledFor: Date,
  newScheduledFor: Date,
  overrides: { durationMinutes?: number; room?: string | null },
  expectedUpdatedAt?: Date,
) {
  const rule = await getRecurrenceRuleWithParticipants(ruleId);
  if (!rule) throw new Error("Recurrence rule not found");

  const recurrenceOccurrenceFor = getCanonicalOccurrence(
    rule,
    originalScheduledFor,
  );
  getRecurrenceTarget(rule, recurrenceOccurrenceFor);
  const target = getRecurrenceTarget(rule, newScheduledFor);
  const durationMinutes = overrides.durationMinutes ?? rule.durationMinutes;

  await assertNoScheduleConflict({
    tutorId: target.tutorId,
    subjectId: target.subjectId,
    studentIds: target.attendances.map((attendance) => attendance.studentId),
    scheduledFor: newScheduledFor,
    durationMinutes,
    excludeRuleOccurrence: { ruleId, occurrenceFor: recurrenceOccurrenceFor },
  });

  return createSessionWithAttendances(
    {
      enrollmentId: rule.enrollmentId ?? undefined,
      tutorId: target.tutorId,
      subjectId: target.subjectId,
      scheduledFor: newScheduledFor,
      recurrenceOccurrenceFor,
      durationMinutes,
      room:
        overrides.room !== undefined
          ? (overrides.room ?? undefined)
          : (rule.room ?? undefined),
      recurrenceRuleId: ruleId,
    },
    target.attendances,
    expectedUpdatedAt ? { ruleId, updatedAt: expectedUpdatedAt } : undefined,
  );
}
