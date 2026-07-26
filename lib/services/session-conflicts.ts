import "server-only";

import { format } from "date-fns";
import { TZDate } from "@date-fns/tz";
import {
  getRecurringSchedulesForConflictWindow as getRecurringSchedulesForConflictWindowData,
  getSessionsForConflictWindow,
} from "@/lib/data/sessions";
import {
  addCalendarDays,
  combineDateAndTime,
  getCalendarDateInTimeZone,
  getConfiguredCenterTimeZone,
  getFirstMatchingDate,
  getFirstRecurrenceOnOrAfter,
  getSessionConflictWindow,
  sessionRangesOverlap,
} from "@/lib/services/session-dates";
import { isEnrollmentEligibleForSession } from "@/lib/services/enrollment-schedule-dates";

export type ConflictStudent = {
  id: string;
  firstName: string;
  lastName: string;
};

type ConflictSchedule = {
  tutorId: string;
  tutorName: string;
  subjectId: string;
  subjectName: string;
  students: ConflictStudent[];
  scheduledFor: Date;
  durationMinutes: number;
};

function formatPersonName(person: { firstName: string; lastName: string }) {
  return `${person.firstName} ${person.lastName}`;
}

function formatConflictTime(date: Date) {
  return format(
    new TZDate(date, getConfiguredCenterTimeZone()),
    "EEE, MMM d 'at' h:mm a",
  );
}

export async function assertNoScheduleConflict(input: {
  tutorId: string;
  subjectId: string;
  studentIds: string[];
  scheduledFor: Date;
  durationMinutes: number;
  checkRecurringRules?: boolean;
  excludeSessionId?: string;
  excludeRecurrenceRuleId?: string;
  excludeRuleOccurrence?: { ruleId: string; occurrenceFor: Date };
}) {
  const conflictWindow = getSessionConflictWindow(
    input.scheduledFor,
    input.durationMinutes,
  );
  const existingSessions = await getSessionsForConflictWindow(
    conflictWindow.start,
    conflictWindow.endExclusive,
    input.excludeSessionId,
    input.excludeRecurrenceRuleId,
  );

  const requestedStudentIds = new Set(input.studentIds);

  for (const session of existingSessions) {
    if (
      !sessionRangesOverlap(
        input.scheduledFor,
        input.durationMinutes,
        new Date(session.scheduledFor),
        session.durationMinutes
      )
    ) {
      continue;
    }

    const sessionStudents = session.attendance.length > 0
      ? session.attendance.map((a) => a.student)
      : session.enrollment?.student
        ? [session.enrollment.student]
        : [];

    throwIfConflict({
      requestedTutorId: input.tutorId,
      requestedSubjectId: input.subjectId,
      requestedStudentIds,
      existing: {
        tutorId: session.tutorId,
        tutorName: formatPersonName(session.tutor),
        subjectId: session.subjectId,
        subjectName: session.subject.name,
        students: sessionStudents,
        scheduledFor: new Date(session.scheduledFor),
        durationMinutes: session.durationMinutes,
      },
    });
  }

  if (input.checkRecurringRules !== false) {
    await assertNoRecurringRuleConflictForOccurrence({
      ...input,
      excludeRuleOccurrence: input.excludeRuleOccurrence,
    });
  }
}

function throwIfConflict(input: {
  requestedTutorId: string;
  requestedSubjectId: string;
  requestedStudentIds: Set<string>;
  existing: ConflictSchedule;
}) {
  const conflictingStudent = input.existing.students.find((student) =>
    input.requestedStudentIds.has(student.id)
  );

  if (
    conflictingStudent &&
    input.existing.tutorId === input.requestedTutorId &&
    input.existing.subjectId === input.requestedSubjectId
  ) {
    throw new Error(
      `${formatPersonName(conflictingStudent)} is already scheduled for this class on ${formatConflictTime(input.existing.scheduledFor)}.`
    );
  }

  if (conflictingStudent) {
    throw new Error(
      `${formatPersonName(conflictingStudent)} already has ${input.existing.subjectName} on ${formatConflictTime(input.existing.scheduledFor)}.`
    );
  }

  if (input.existing.tutorId === input.requestedTutorId) {
    throw new Error(
      `${input.existing.tutorName} is already teaching ${input.existing.subjectName} on ${formatConflictTime(input.existing.scheduledFor)}.`
    );
  }
}

async function getRecurringSchedulesForConflictWindow(from: Date, to: Date) {
  const rules = await getRecurringSchedulesForConflictWindowData(from, to);

  return rules.filter((rule) => !rule.endsOn || rule.endsOn >= rule.startsOn);
}

function getConflictScheduleForRule(
  rule: Awaited<ReturnType<typeof getRecurringSchedulesForConflictWindow>>[number],
  scheduledFor: Date
): ConflictSchedule | null {
  if (rule.enrollment) {
    if (
      !isEnrollmentEligibleForSession(
        rule.enrollment,
        scheduledFor,
        rule.timeZone,
      )
    ) {
      return null;
    }
    return {
      tutorId: rule.enrollment.tutorId,
      tutorName: formatPersonName(rule.enrollment.tutor),
      subjectId: rule.enrollment.subjectId,
      subjectName: rule.enrollment.subject.name,
      students: [rule.enrollment.student],
      scheduledFor,
      durationMinutes: rule.durationMinutes,
    };
  }

  if (rule.group) {
    const enrollments = rule.group.enrollments.filter((enrollment) =>
      isEnrollmentEligibleForSession(
        enrollment,
        scheduledFor,
        rule.timeZone,
      ),
    );
    if (enrollments.length === 0) return null;
    return {
      tutorId: rule.group.tutorId,
      tutorName: formatPersonName(rule.group.tutor),
      subjectId: rule.group.subjectId,
      subjectName: rule.group.subject.name,
      students: enrollments.map((enrollment) => enrollment.student),
      scheduledFor,
      durationMinutes: rule.durationMinutes,
    };
  }

  return null;
}

async function assertNoRecurringRuleConflictForOccurrence(input: {
  tutorId: string;
  subjectId: string;
  studentIds: string[];
  scheduledFor: Date;
  durationMinutes: number;
  excludeRuleOccurrence?: { ruleId: string; occurrenceFor: Date };
}) {
  const conflictWindow = getSessionConflictWindow(
    input.scheduledFor,
    input.durationMinutes,
  );
  const rules = await getRecurringSchedulesForConflictWindow(
    conflictWindow.start,
    conflictWindow.endExclusive,
  );
  const requestedStudentIds = new Set(input.studentIds);

  for (const rule of rules) {
    const calendarStart = getCalendarDateInTimeZone(
      conflictWindow.start,
      rule.timeZone,
    );
    const calendarEnd = getCalendarDateInTimeZone(
      new Date(conflictWindow.endExclusive.getTime() - 1),
      rule.timeZone,
    );
    let calendarDate = getFirstRecurrenceOnOrAfter(
      new Date(rule.startsOn),
      rule.dayOfWeek,
      rule.intervalWeeks,
      calendarStart,
    );
    while (calendarDate <= calendarEnd) {
      if (rule.endsOn && calendarDate > new Date(rule.endsOn)) break;
      const occurrence = combineDateAndTime(
        calendarDate,
        rule.startTime,
        rule.timeZone,
      );
      const isExcludedOccurrence =
        input.excludeRuleOccurrence?.ruleId === rule.id &&
        input.excludeRuleOccurrence.occurrenceFor.getTime() ===
          occurrence.getTime();
      if (
        !isExcludedOccurrence &&
        sessionRangesOverlap(
          input.scheduledFor,
          input.durationMinutes,
          occurrence,
          rule.durationMinutes,
        )
      ) {
        const existing = getConflictScheduleForRule(rule, occurrence);
        if (existing) {
          throwIfConflict({
            requestedTutorId: input.tutorId,
            requestedSubjectId: input.subjectId,
            requestedStudentIds,
            existing,
          });
        }
      }
      calendarDate = addCalendarDays(
        calendarDate,
        rule.intervalWeeks * 7,
      );
    }
  }
}

export async function assertNoRecurringScheduleConflict(input: {
  tutorId: string;
  subjectId: string;
  students: ConflictStudent[];
  daysOfWeek: number[];
  startTime: string;
  startTimes?: Record<string, string>;
  durationMinutes: number;
  intervalWeeks: number;
  startsOn: Date;
  endsOn?: Date;
  timeZone?: string;
  excludeRecurrenceRuleId?: string;
}) {
  const windowEnd =
    input.endsOn && input.endsOn < addCalendarDays(input.startsOn, 90)
    ? input.endsOn
    : addCalendarDays(input.startsOn, 90);

  for (const dayOfWeek of input.daysOfWeek) {
    let current = getFirstMatchingDate(input.startsOn, dayOfWeek);
    const startTime = input.startTimes?.[String(dayOfWeek)] ?? input.startTime;
    while (current <= windowEnd) {
      const scheduledFor = combineDateAndTime(
        current,
        startTime,
        input.timeZone,
      );
      await assertNoScheduleConflict({
        tutorId: input.tutorId,
        subjectId: input.subjectId,
        studentIds: input.students.map((student) => student.id),
        scheduledFor,
        durationMinutes: input.durationMinutes,
        checkRecurringRules: false,
        excludeRecurrenceRuleId: input.excludeRecurrenceRuleId,
      });
      current = addCalendarDays(current, input.intervalWeeks * 7);
    }
  }

  const proposedOccurrences = input.daysOfWeek.flatMap((dayOfWeek) => {
    const occurrences: Date[] = [];
    let current = getFirstMatchingDate(input.startsOn, dayOfWeek);
    const startTime = input.startTimes?.[String(dayOfWeek)] ?? input.startTime;
    while (current <= windowEnd) {
      occurrences.push(
        combineDateAndTime(current, startTime, input.timeZone),
      );
      current = addCalendarDays(current, input.intervalWeeks * 7);
    }
    return occurrences;
  });
  if (proposedOccurrences.length === 0) return;

  const requestedStudentIds = new Set(input.students.map((student) => student.id));
  const earliestProposed = new Date(
    Math.min(...proposedOccurrences.map((date) => date.getTime())),
  );
  const latestProposedEnd = new Date(
    Math.max(
      ...proposedOccurrences.map(
        (date) => date.getTime() + input.durationMinutes * 60_000,
      ),
    ),
  );
  const recurringWindow = getSessionConflictWindow(
    earliestProposed,
    Math.ceil(
      (latestProposedEnd.getTime() - earliestProposed.getTime()) / 60_000,
    ),
  );
  const existingRules = await getRecurringSchedulesForConflictWindow(
    recurringWindow.start,
    recurringWindow.endExclusive,
  );
  for (const rule of existingRules) {
    if (rule.id === input.excludeRecurrenceRuleId) continue;
    const calendarStart = getCalendarDateInTimeZone(
      recurringWindow.start,
      rule.timeZone,
    );
    const calendarEnd = getCalendarDateInTimeZone(
      new Date(recurringWindow.endExclusive.getTime() - 1),
      rule.timeZone,
    );
    let current = getFirstRecurrenceOnOrAfter(
      new Date(rule.startsOn),
      rule.dayOfWeek,
      rule.intervalWeeks,
      calendarStart,
    );
    while (current <= calendarEnd) {
      if (rule.endsOn && current > new Date(rule.endsOn)) break;
      const existingOccurrence = combineDateAndTime(
        current,
        rule.startTime,
        rule.timeZone,
      );
      const matchingOccurrence = proposedOccurrences.find((scheduledFor) =>
        sessionRangesOverlap(
          scheduledFor,
          input.durationMinutes,
          existingOccurrence,
          rule.durationMinutes
        )
      );
      if (!matchingOccurrence) {
        current = addCalendarDays(current, rule.intervalWeeks * 7);
        continue;
      }

      const existing = getConflictScheduleForRule(rule, existingOccurrence);
      if (!existing) {
        current = addCalendarDays(current, rule.intervalWeeks * 7);
        continue;
      }
      throwIfConflict({
        requestedTutorId: input.tutorId,
        requestedSubjectId: input.subjectId,
        requestedStudentIds,
        existing,
      });

      current = addCalendarDays(current, rule.intervalWeeks * 7);
    }
  }
}
