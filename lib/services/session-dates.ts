export function getFirstMatchingDate(startDate: Date, dayOfWeek: number): Date {
  const startUTCDay = startDate.getUTCDay();
  const daysUntil = (dayOfWeek - startUTCDay + 7) % 7;
  return new Date(Date.UTC(
    startDate.getUTCFullYear(),
    startDate.getUTCMonth(),
    startDate.getUTCDate() + daysUntil
  ));
}

export function combineDateAndTime(date: Date, timeString: string): Date {
  const [hours, minutes] = timeString.split(":").map(Number);
  return new Date(Date.UTC(
    date.getUTCFullYear(),
    date.getUTCMonth(),
    date.getUTCDate(),
    hours,
    minutes
  ));
}

export function getEnrollmentWeekKey(enrollmentId: string, date: Date): string {
  const utcDay = date.getUTCDay();
  const daysSinceMonday = (utcDay + 6) % 7;
  const monday = new Date(Date.UTC(
    date.getUTCFullYear(),
    date.getUTCMonth(),
    date.getUTCDate() - daysSinceMonday
  ));
  const y = monday.getUTCFullYear();
  const m = String(monday.getUTCMonth() + 1).padStart(2, "0");
  const d = String(monday.getUTCDate()).padStart(2, "0");
  return `${enrollmentId}:${y}-${m}-${d}`;
}
