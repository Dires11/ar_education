import { TZDate } from "@date-fns/tz";

export const DEFAULT_CENTER_TIME_ZONE = "America/Los_Angeles";

export function addCalendarDays(date: Date, days: number): Date {
  return new Date(
    Date.UTC(
      date.getUTCFullYear(),
      date.getUTCMonth(),
      date.getUTCDate() + days,
    ),
  );
}

export function getFirstMatchingDate(startDate: Date, dayOfWeek: number): Date {
  const startUTCDay = startDate.getUTCDay();
  const daysUntil = (dayOfWeek - startUTCDay + 7) % 7;
  return addCalendarDays(startDate, daysUntil);
}

export function getFirstRecurrenceOnOrAfter(
  ruleStart: Date,
  dayOfWeek: number,
  intervalWeeks: number,
  windowStart: Date,
): Date {
  if (!Number.isInteger(intervalWeeks) || intervalWeeks <= 0) {
    throw new Error("Recurrence interval must be a positive whole number");
  }
  let occurrence = getFirstMatchingDate(ruleStart, dayOfWeek);
  while (occurrence < windowStart) {
    occurrence = addCalendarDays(occurrence, intervalWeeks * 7);
  }
  return occurrence;
}

export function combineDateAndTime(
  date: Date,
  timeString: string,
  timeZone = DEFAULT_CENTER_TIME_ZONE,
): Date {
  const [hours, minutes] = timeString.split(":").map(Number);
  const zoned = new TZDate(
    date.getUTCFullYear(),
    date.getUTCMonth(),
    date.getUTCDate(),
    hours,
    minutes,
    0,
    0,
    timeZone,
  );
  return new Date(zoned.getTime());
}

export function getCalendarDateKey(
  date: Date,
  timeZone = DEFAULT_CENTER_TIME_ZONE,
): string {
  const zoned = new TZDate(date, timeZone);
  const year = zoned.getFullYear();
  const month = String(zoned.getMonth() + 1).padStart(2, "0");
  const day = String(zoned.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function getCalendarDateInTimeZone(
  date: Date,
  timeZone = DEFAULT_CENTER_TIME_ZONE,
): Date {
  const zoned = new TZDate(date, timeZone);
  return new Date(
    Date.UTC(zoned.getFullYear(), zoned.getMonth(), zoned.getDate()),
  );
}

export function getDayRangeInTimeZone(
  date: Date,
  timeZone = DEFAULT_CENTER_TIME_ZONE,
): { start: Date; end: Date } {
  const zoned = new TZDate(date, timeZone);
  const start = new TZDate(
    zoned.getFullYear(),
    zoned.getMonth(),
    zoned.getDate(),
    0,
    0,
    0,
    0,
    timeZone,
  );
  const nextDay = new TZDate(
    zoned.getFullYear(),
    zoned.getMonth(),
    zoned.getDate() + 1,
    0,
    0,
    0,
    0,
    timeZone,
  );
  return {
    start: new Date(start.getTime()),
    end: new Date(nextDay.getTime() - 1),
  };
}

export function getEnrollmentWeekKey(
  enrollmentId: string,
  date: Date,
  timeZone = DEFAULT_CENTER_TIME_ZONE,
): string {
  const zoned = new TZDate(date, timeZone);
  const calendarDate = new Date(
    Date.UTC(zoned.getFullYear(), zoned.getMonth(), zoned.getDate()),
  );
  const daysSinceMonday = (calendarDate.getUTCDay() + 6) % 7;
  const monday = addCalendarDays(calendarDate, -daysSinceMonday);
  const year = monday.getUTCFullYear();
  const month = String(monday.getUTCMonth() + 1).padStart(2, "0");
  const day = String(monday.getUTCDate()).padStart(2, "0");
  return `${enrollmentId}:${year}-${month}-${day}`;
}
