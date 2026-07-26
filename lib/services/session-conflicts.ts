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
  getDayRangeInTimeZone,
  getFirstMatchingDate,
} from "@/lib/services/session-dates";

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

function rangesOverlap(startA: Date, durationA: number, startB: Date, durationB: number) {
  const endA = new Date(startA.getTime() + durationA * 60_000);
  const endB = new Date(startB.getTime() + durationB * 60_000);
  return startA < endB && startB < endA;
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
  const { start: dayStart, end: dayEnd } = getDayRangeInTimeZone(
    input.scheduledFor,
    getConfiguredCenterTimeZone(),
  );
  const existingSessions = await getSessionsForConflictWindow(
    dayStart,
    dayEnd,
    input.excludeSessionId,
    input.excludeRecurrenceRuleId,
  );

  const requestedStudentIds = new Set(input.studentIds);

  for (const session of existingSessions) {
    if (
      !rangesOverlap(
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
    return {
      tutorId: rule.group.tutorId,
      tutorName: formatPersonName(rule.group.tutor),
      subjectId: rule.group.subjectId,
      subjectName: rule.group.subject.name,
      students: rule.group.enrollments.map((enrollment) => enrollment.student),
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
  const { start, end } = getDayRangeInTimeZone(
    input.scheduledFor,
    getConfiguredCenterTimeZone(),
  );
  const rules = await getRecurringSchedulesForConflictWindow(
    start,
    end,
  );
  const requestedStudentIds = new Set(input.studentIds);

  for (const rule of rules) {
    const calendarDate = getCalendarDateInTimeZone(
      input.scheduledFor,
      rule.timeZone,
    );
    if (
      calendarDate < new Date(rule.startsOn) ||
      (rule.endsOn && calendarDate > new Date(rule.endsOn))
    ) {
      continue;
    }
    const firstOccurrence = getFirstMatchingDate(
      new Date(rule.startsOn),
      rule.dayOfWeek,
    );
    const daysFromStart = Math.round(
      (calendarDate.getTime() - firstOccurrence.getTime()) / 86_400_000,
    );
    if (
      daysFromStart < 0 ||
      daysFromStart % (rule.intervalWeeks * 7) !== 0
    ) {
      continue;
    }
    const occurrence = combineDateAndTime(
      calendarDate,
      rule.startTime,
      rule.timeZone,
    );
    if (
      input.excludeRuleOccurrence?.ruleId === rule.id &&
      input.excludeRuleOccurrence.occurrenceFor.getTime() === occurrence.getTime()
    ) {
      continue;
    }
    if (
      !rangesOverlap(
        input.scheduledFor,
        input.durationMinutes,
        occurrence,
        rule.durationMinutes
      )
    ) {
      continue;
    }

    const existing = getConflictScheduleForRule(rule, occurrence);
    if (!existing) continue;
    throwIfConflict({
      requestedTutorId: input.tutorId,
      requestedSubjectId: input.subjectId,
      requestedStudentIds,
      existing,
    });
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

  const requestedStudentIds = new Set(input.students.map((student) => student.id));
  const existingRules = await getRecurringSchedulesForConflictWindow(input.startsOn, windowEnd);
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

  for (const rule of existingRules) {
    if (rule.id === input.excludeRecurrenceRuleId) continue;
    let current = getFirstMatchingDate(
      new Date(rule.startsOn),
      rule.dayOfWeek,
    );
    while (current < input.startsOn) {
      current = addCalendarDays(current, rule.intervalWeeks * 7);
    }
    while (current <= windowEnd) {
      if (rule.endsOn && current > new Date(rule.endsOn)) break;
      const existingOccurrence = combineDateAndTime(
        current,
        rule.startTime,
        rule.timeZone,
      );
      const matchingOccurrence = proposedOccurrences.find((scheduledFor) =>
        rangesOverlap(
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
