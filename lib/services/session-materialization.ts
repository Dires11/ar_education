import {
  addDays,
  endOfDay,
  endOfWeek,
  format,
  startOfDay,
  startOfWeek,
} from "date-fns";
import {
  createManySessionAttendances,
  createManySessions,
  getGroupRecurringRulesInRange,
  getNonCancelledEnrollmentSessionsInRange,
  getRecurringRulesInRange,
  getSessionsForRecurrenceRulesInRange,
} from "@/lib/data/sessions";
import { prisma } from "@/lib/prisma";
import {
  combineDateAndTime,
  getEnrollmentWeekKey,
  getFirstMatchingDate,
} from "@/lib/services/session-dates";

export async function materializeSessions(
  fromDate: Date,
  toDate: Date,
  options?: { recurrenceRuleIds?: string[] }
): Promise<number> {
  const rules = await getRecurringRulesInRange(fromDate, toDate, options);
  if (rules.length === 0) return 0;

  const sessions: Array<{
    enrollmentId: string;
    tutorId: string;
    subjectId: string;
    scheduledFor: Date;
    durationMinutes: number;
    room?: string;
    recurrenceRuleId: string;
  }> = [];

  const existingSessions = await getSessionsForRecurrenceRulesInRange(
    rules.map((rule) => rule.id),
    fromDate,
    toDate
  );
  const coveredSlots = new Set(
    existingSessions
      .filter((session) => session.recurrenceRuleId)
      .map(
        (session) =>
          `${session.recurrenceRuleId}:${format(session.scheduledFor, "yyyyMMddHHmm")}`
      )
  );
  const existingWeeklySessions = await getNonCancelledEnrollmentSessionsInRange(
    [...new Set(rules.map((rule) => rule.enrollmentId).filter((id): id is string => id !== null))],
    startOfWeek(fromDate, { weekStartsOn: 1 }),
    endOfWeek(toDate, { weekStartsOn: 1 })
  );
  const weeklyCounts = new Map<string, number>();
  for (const session of existingWeeklySessions) {
    if (!session.enrollmentId) continue;

    const key = getEnrollmentWeekKey(
      session.enrollmentId,
      new Date(session.scheduledFor)
    );
    weeklyCounts.set(key, (weeklyCounts.get(key) ?? 0) + 1);
  }

  for (const rule of rules) {
    const { enrollment } = rule;
    if (!enrollment || !rule.enrollmentId) continue;
    const enrollmentId = rule.enrollmentId;
    const searchStart =
      new Date(rule.startsOn) > fromDate ? new Date(rule.startsOn) : fromDate;
    let current = getFirstMatchingDate(searchStart, rule.dayOfWeek);

    while (current <= toDate) {
      if (rule.endsOn && current > new Date(rule.endsOn)) break;

      const scheduledFor = combineDateAndTime(current, rule.startTime);
      const slotKey = `${rule.id}:${format(scheduledFor, "yyyyMMddHHmm")}`;
      const weekKey = getEnrollmentWeekKey(enrollmentId, scheduledFor);
      const sessionsPerWeek = enrollment.package.sessionsPerWeek ?? null;

      if (coveredSlots.has(slotKey)) {
        current = addDays(current, rule.intervalWeeks * 7);
        continue;
      }
      if (
        sessionsPerWeek !== null &&
        (weeklyCounts.get(weekKey) ?? 0) >= sessionsPerWeek
      ) {
        current = addDays(current, rule.intervalWeeks * 7);
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
      });
      coveredSlots.add(slotKey);
      weeklyCounts.set(weekKey, (weeklyCounts.get(weekKey) ?? 0) + 1);

      current = addDays(current, rule.intervalWeeks * 7);
    }
  }

  const result = sessions.length > 0
    ? await createManySessions(sessions)
    : { count: 0 };

  const allRuleSessions = await prisma.session.findMany({
    where: {
      recurrenceRuleId: { in: rules.map((rule) => rule.id) },
      scheduledFor: { gte: startOfDay(fromDate), lte: endOfDay(toDate) },
      enrollmentId: { not: null },
    },
    select: { id: true, enrollmentId: true },
  });
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

  const existingSessions = await getSessionsForRecurrenceRulesInRange(
    rules.map((r) => r.id),
    fromDate,
    toDate
  );
  const coveredSlots = new Set(
    existingSessions
      .filter((s) => s.recurrenceRuleId)
      .map((s) => `${s.recurrenceRuleId}:${format(s.scheduledFor, "yyyyMMddHHmm")}`)
  );

  const sessionsToCreate: Array<{
    tutorId: string;
    subjectId: string;
    scheduledFor: Date;
    durationMinutes: number;
    room?: string;
    recurrenceRuleId: string;
  }> = [];

  for (const rule of rules) {
    if (!rule.group) continue;
    const searchStart =
      new Date(rule.startsOn) > fromDate ? new Date(rule.startsOn) : fromDate;
    let current = getFirstMatchingDate(searchStart, rule.dayOfWeek);

    while (current <= toDate) {
      if (rule.endsOn && current > new Date(rule.endsOn)) break;
      const scheduledFor = combineDateAndTime(current, rule.startTime);
      const slotKey = `${rule.id}:${format(scheduledFor, "yyyyMMddHHmm")}`;
      if (!coveredSlots.has(slotKey)) {
        sessionsToCreate.push({
          tutorId: rule.group.tutorId,
          subjectId: rule.group.subjectId,
          scheduledFor,
          durationMinutes: rule.durationMinutes,
          room: rule.room ?? undefined,
          recurrenceRuleId: rule.id,
        });
        coveredSlots.add(slotKey);
      }
      current = addDays(current, rule.intervalWeeks * 7);
    }
  }

  if (sessionsToCreate.length > 0) {
    await createManySessions(sessionsToCreate);
  }

  const groupRuleIds = rules.map((r) => r.id);
  const allGroupSessions = await prisma.session.findMany({
    where: {
      recurrenceRuleId: { in: groupRuleIds },
      scheduledFor: { gte: startOfDay(fromDate), lte: endOfDay(toDate) },
    },
    select: { id: true, recurrenceRuleId: true },
  });

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
