import { addDays, format } from "date-fns";
import { getSessionsInRange, getRecurringRulesInRange } from "@/lib/data/sessions";
import { getFirstMatchingDate, combineDateAndTime } from "@/lib/services/sessions";

// ─── Types ────────────────────────────────────────────────────────────────────

export type CalendarSession = {
  id: string;
  scheduledFor: Date;
  durationMinutes: number;
  status: string;
  room: string | null;
  notes: string | null;
  tutor: { id: string; firstName: string; lastName: string };
  subject: { id: string; name: string };
  enrollmentId: string | null;
  recurrenceRuleId: string | null;
  attendance: Array<{ student: { firstName: string; lastName: string } }>;
  virtual: boolean;
  ruleId: string | null;
  startTime: string | null;
  dayOfWeek: number | null;
  intervalWeeks: number | null;
};

// ─── Calendar query ───────────────────────────────────────────────────────────

export async function getCalendarSessions(
  fromDate: Date,
  toDate: Date
): Promise<CalendarSession[]> {
  const [realSessions, rules] = await Promise.all([
    getSessionsInRange(fromDate, toDate),
    getRecurringRulesInRange(fromDate, toDate),
  ]);

  // Index real sessions for O(1) dedup.
  // Two keys per session: recurrenceRuleId-based (preferred) and enrollment+day+hour fallback.
  const coveredSlots = new Set<string>();
  for (const s of realSessions) {
    const day = format(s.scheduledFor, "yyyy-MM-dd");
    if (s.recurrenceRuleId) {
      coveredSlots.add(`${s.recurrenceRuleId}:${day}`);
    }
    if (s.enrollmentId) {
      coveredSlots.add(`${s.enrollmentId}:${day}:${s.scheduledFor.getHours()}`);
    }
  }

  // Map real sessions to the unified type
  const result: CalendarSession[] = realSessions.map((s) => ({
    id: s.id,
    scheduledFor: s.scheduledFor,
    durationMinutes: s.durationMinutes,
    status: s.status,
    room: s.room,
    notes: s.notes,
    tutor: { id: s.tutor.id, firstName: s.tutor.firstName, lastName: s.tutor.lastName },
    subject: { id: s.subject.id, name: s.subject.name },
    enrollmentId: s.enrollmentId,
    recurrenceRuleId: s.recurrenceRuleId,
    attendance: s.attendance.map((a) => ({
      student: { firstName: a.student.firstName, lastName: a.student.lastName },
    })),
    virtual: false,
    ruleId: null,
    startTime: null,
    dayOfWeek: null,
    intervalWeeks: null,
  }));

  // Generate virtual sessions for any slot not covered by a real session
  for (const rule of rules) {
    const { enrollment } = rule;
    const searchStart =
      new Date(rule.startsOn) > fromDate ? new Date(rule.startsOn) : fromDate;
    let current = getFirstMatchingDate(searchStart, rule.dayOfWeek);

    while (current <= toDate) {
      if (rule.endsOn && current > new Date(rule.endsOn)) break;

      const scheduledFor = combineDateAndTime(current, rule.startTime);
      const day = format(scheduledFor, "yyyy-MM-dd");
      const h = scheduledFor.getHours();

      const isCovered =
        coveredSlots.has(`${rule.id}:${day}`) ||
        coveredSlots.has(`${rule.enrollmentId}:${day}:${h}`);

      if (!isCovered) {
        result.push({
          id: `${rule.id}:${scheduledFor.toISOString()}`,
          scheduledFor,
          durationMinutes: rule.durationMinutes,
          status: "VIRTUAL_UPCOMING",
          room: rule.room,
          notes: null,
          tutor: {
            id: enrollment.tutorId,
            firstName: enrollment.tutor.firstName,
            lastName: enrollment.tutor.lastName,
          },
          subject: {
            id: enrollment.subjectId,
            name: enrollment.subject.name,
          },
          enrollmentId: rule.enrollmentId,
          recurrenceRuleId: rule.id,
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
          startTime: rule.startTime,
          dayOfWeek: rule.dayOfWeek,
          intervalWeeks: rule.intervalWeeks,
        });
      }

      current = addDays(current, rule.intervalWeeks * 7);
    }
  }

  result.sort((a, b) => a.scheduledFor.getTime() - b.scheduledFor.getTime());
  return result;
}
