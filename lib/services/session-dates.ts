import { addDays, format, set, startOfWeek } from "date-fns";

export function getFirstMatchingDate(startDate: Date, dayOfWeek: number): Date {
  const daysUntil = (dayOfWeek - startDate.getDay() + 7) % 7;
  return addDays(startDate, daysUntil);
}

export function combineDateAndTime(date: Date, timeString: string): Date {
  const [hours, minutes] = timeString.split(":").map(Number);
  return set(new Date(date), { hours, minutes, seconds: 0, milliseconds: 0 });
}

export function getEnrollmentWeekKey(enrollmentId: string, date: Date): string {
  return `${enrollmentId}:${format(startOfWeek(date, { weekStartsOn: 1 }), "yyyy-MM-dd")}`;
}
