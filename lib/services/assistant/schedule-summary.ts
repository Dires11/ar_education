export type AssistantWeekScheduleEntry = {
  scheduledFor: Date | string;
  tutor: {
    id: string;
    firstName: string;
    lastName: string;
  };
};

const WEEKDAY_LABELS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

export function summarizeAssistantWeekSchedule(
  sessions: AssistantWeekScheduleEntry[],
  timeZone: string,
) {
  const tutorCounts = new Map<string, { name: string; count: number }>();
  const weekdayCounts: Record<string, number> = Object.fromEntries(
    WEEKDAY_LABELS.map((day) => [day, 0]),
  );
  const weekdayFormatter = new Intl.DateTimeFormat("en-US", {
    weekday: "short",
    timeZone,
  });

  for (const session of sessions) {
    const tutorName = `${session.tutor.firstName} ${session.tutor.lastName}`;
    const existing = tutorCounts.get(session.tutor.id);
    if (existing) existing.count += 1;
    else tutorCounts.set(session.tutor.id, { name: tutorName, count: 1 });

    const day = weekdayFormatter.format(new Date(session.scheduledFor));
    if (day in weekdayCounts) weekdayCounts[day] += 1;
  }

  return {
    tutorCounts: [...tutorCounts.values()].sort(
      (left, right) => right.count - left.count,
    ),
    weeklySessionsByDay: WEEKDAY_LABELS.map((day) => ({
      day,
      sessions: weekdayCounts[day],
    })),
  };
}
