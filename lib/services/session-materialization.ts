import "server-only";

import {
  createManySessionAttendances,
  createManySessions,
  getGroupRecurringRulesInRange,
  getNonCancelledEnrollmentSessionsInRange,
  getRecurringRulesInRange,
  getSessionsForRecurrenceRulesInRange,
} from "@/lib/data/sessions";
import {
  addCalendarDays,
  combineDateAndTime,
  getCalendarDateInTimeZone,
  getCalendarWeekRange,
  getConfiguredCenterTimeZone,
  getEnrollmentWeekKey,
  getFirstRecurrenceOnOrAfter,
} from "@/lib/services/session-dates";

function getOccurrenceQueryWindow(
  rules: Array<{ timeZone: string }>,
  fromDate: Date,
  toDate: Date,
) {
  const starts = rules.map((rule) =>
    combineDateAndTime(
      getCalendarDateInTimeZone(fromDate, rule.timeZone),
      "00:00",
      rule.timeZone,
    ),
  );
  const endsExclusive = rules.map((rule) =>
    combineDateAndTime(
      addCalendarDays(
        getCalendarDateInTimeZone(toDate, rule.timeZone),
        1,
      ),
      "00:00",
      rule.timeZone,
    ),
  );

  return {
    start: new Date(Math.min(...starts.map((date) => date.getTime()))),
    endExclusive: new Date(
      Math.max(...endsExclusive.map((date) => date.getTime())),
    ),
  };
}

export async function materializeSessions(
  fromDate: Date,
  toDate: Date,
  options?: { recurrenceRuleIds?: string[] }
): Promise<number> {
  const rules = await getRecurringRulesInRange(fromDate, toDate, options);
  if (rules.length === 0) return 0;
  const occurrenceWindow = getOccurrenceQueryWindow(
    rules,
    fromDate,
    toDate,
  );

  const sessions: Array<{
    enrollmentId: string;
    tutorId: string;
    subjectId: string;
    scheduledFor: Date;
    durationMinutes: number;
    room?: string;
    recurrenceRuleId: string;
    recurrenceOccurrenceFor: Date;
  }> = [];

  const existingSessions = await getSessionsForRecurrenceRulesInRange(
    rules.map((rule) => rule.id),
    occurrenceWindow.start,
    occurrenceWindow.endExclusive,
  );
  const coveredSlots = new Set(
    existingSessions
      .filter((session) => session.recurrenceRuleId)
      .map(
        (session) =>
          `${session.recurrenceRuleId}:${(
            session.recurrenceOccurrenceFor ?? session.scheduledFor
          ).toISOString()}`,
      )
  );
  const centerTimeZone = getConfiguredCenterTimeZone();
  const firstWeek = getCalendarWeekRange(fromDate, centerTimeZone);
  const lastWeek = getCalendarWeekRange(toDate, centerTimeZone);
  const existingWeeklySessions = await getNonCancelledEnrollmentSessionsInRange(
    [...new Set(rules.map((rule) => rule.enrollmentId).filter((id): id is string => id !== null))],
    firstWeek.start,
    lastWeek.endExclusive,
  );
  const weeklyCounts = new Map<string, number>();
  for (const session of existingWeeklySessions) {
    if (!session.enrollmentId) continue;

    const key = getEnrollmentWeekKey(
      session.enrollmentId,
      new Date(session.scheduledFor),
      centerTimeZone,
    );
    weeklyCounts.set(key, (weeklyCounts.get(key) ?? 0) + 1);
  }

  for (const rule of rules) {
    const { enrollment } = rule;
    if (!enrollment || !rule.enrollmentId) continue;
    const enrollmentId = rule.enrollmentId;
    const calendarFrom = getCalendarDateInTimeZone(fromDate, rule.timeZone);
    const calendarTo = getCalendarDateInTimeZone(toDate, rule.timeZone);
    let current = getFirstRecurrenceOnOrAfter(
      new Date(rule.startsOn),
      rule.dayOfWeek,
      rule.intervalWeeks,
      calendarFrom,
    );

    while (current <= calendarTo) {
      if (rule.endsOn && current > new Date(rule.endsOn)) break;

      const scheduledFor = combineDateAndTime(
        current,
        rule.startTime,
        rule.timeZone,
      );
      const slotKey = `${rule.id}:${scheduledFor.toISOString()}`;
      const weekKey = getEnrollmentWeekKey(
        enrollmentId,
        scheduledFor,
        centerTimeZone,
      );
      const sessionsPerWeek = enrollment.package.sessionsPerWeek ?? null;

      if (coveredSlots.has(slotKey)) {
        current = addCalendarDays(current, rule.intervalWeeks * 7);
        continue;
      }
      if (
        sessionsPerWeek !== null &&
        (weeklyCounts.get(weekKey) ?? 0) >= sessionsPerWeek
      ) {
        current = addCalendarDays(current, rule.intervalWeeks * 7);
        continue;
      }

      sessions.push({
        enrollmentId,
        tutorId: enrollment.tutorId,
        subjectId: enrollment.subjectId,
        scheduledFor,
        durationMinutes: rule.durationMinutes,
        room: rule.room ?? undefined,
        recurrenceRuleId: rule.id,
        recurrenceOccurrenceFor: scheduledFor,
      });
      coveredSlots.add(slotKey);
      weeklyCounts.set(weekKey, (weeklyCounts.get(weekKey) ?? 0) + 1);

      current = addCalendarDays(current, rule.intervalWeeks * 7);
    }
  }

  const result = sessions.length > 0
    ? await createManySessions(sessions)
    : { count: 0 };

  const allRuleSessions = (
    await getSessionsForRecurrenceRulesInRange(
      rules.map((rule) => rule.id),
      occurrenceWindow.start,
      occurrenceWindow.endExclusive,
    )
  ).filter((session) => session.enrollmentId);
  const enrollmentById = new Map(
    rules
      .filter((rule) => rule.enrollment && rule.enrollmentId)
      .map((rule) => [rule.enrollmentId!, rule.enrollment!])
  );
  const attendanceRows = allRuleSessions.flatMap((session) => {
    if (!session.enrollmentId) return [];
    const enrollment = enrollmentById.get(session.enrollmentId);
    if (!enrollment) return [];
    return [{
      sessionId: session.id,
      studentId: enrollment.studentId,
      enrollmentId: session.enrollmentId,
    }];
  });
  if (attendanceRows.length > 0) {
    await createManySessionAttendances(attendanceRows);
  }

  return result.count;
}

export async function materializeGroupSessions(
  fromDate: Date,
  toDate: Date,
  options?: { recurrenceRuleIds?: string[] }
): Promise<number> {
  const rules = await getGroupRecurringRulesInRange(fromDate, toDate, options);
  if (rules.length === 0) return 0;
  const occurrenceWindow = getOccurrenceQueryWindow(
    rules,
    fromDate,
    toDate,
  );

  const existingSessions = await getSessionsForRecurrenceRulesInRange(
    rules.map((r) => r.id),
    occurrenceWindow.start,
    occurrenceWindow.endExclusive,
  );
  const coveredSlots = new Set(
    existingSessions
      .filter((s) => s.recurrenceRuleId)
      .map(
        (session) =>
          `${session.recurrenceRuleId}:${(
            session.recurrenceOccurrenceFor ?? session.scheduledFor
          ).toISOString()}`,
      )
  );

  const sessionsToCreate: Array<{
    tutorId: string;
    subjectId: string;
    scheduledFor: Date;
    durationMinutes: number;
    room?: string;
    recurrenceRuleId: string;
    recurrenceOccurrenceFor: Date;
  }> = [];

  for (const rule of rules) {
    if (!rule.group) continue;
    const calendarFrom = getCalendarDateInTimeZone(fromDate, rule.timeZone);
    const calendarTo = getCalendarDateInTimeZone(toDate, rule.timeZone);
    let current = getFirstRecurrenceOnOrAfter(
      new Date(rule.startsOn),
      rule.dayOfWeek,
      rule.intervalWeeks,
      calendarFrom,
    );

    while (current <= calendarTo) {
      if (rule.endsOn && current > new Date(rule.endsOn)) break;
      const scheduledFor = combineDateAndTime(
        current,
        rule.startTime,
        rule.timeZone,
      );
      const slotKey = `${rule.id}:${scheduledFor.toISOString()}`;
      if (!coveredSlots.has(slotKey)) {
        sessionsToCreate.push({
          tutorId: rule.group.tutorId,
          subjectId: rule.group.subjectId,
          scheduledFor,
          durationMinutes: rule.durationMinutes,
          room: rule.room ?? undefined,
          recurrenceRuleId: rule.id,
          recurrenceOccurrenceFor: scheduledFor,
        });
        coveredSlots.add(slotKey);
      }
      current = addCalendarDays(current, rule.intervalWeeks * 7);
    }
  }

  if (sessionsToCreate.length > 0) {
    await createManySessions(sessionsToCreate);
  }

  const groupRuleIds = rules.map((r) => r.id);
  const allGroupSessions = await getSessionsForRecurrenceRulesInRange(
    groupRuleIds,
    occurrenceWindow.start,
    occurrenceWindow.endExclusive,
  );

  const ruleById = new Map(rules.map((r) => [r.id, r]));
  const attendanceRows: Array<{
    sessionId: string;
    studentId: string;
    enrollmentId: string;
  }> = [];

  for (const session of allGroupSessions) {
    const rule = ruleById.get(session.recurrenceRuleId!);
    if (!rule?.group) continue;
    for (const enrollment of rule.group.enrollments) {
      attendanceRows.push({
        sessionId: session.id,
        studentId: enrollment.studentId,
        enrollmentId: enrollment.id,
      });
    }
  }

  if (attendanceRows.length > 0) {
    await createManySessionAttendances(attendanceRows);
  }

  return sessionsToCreate.length;
}
