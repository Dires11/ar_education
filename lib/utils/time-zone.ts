import { TZDate } from "@date-fns/tz";
import { format } from "date-fns";

type DateValue = Date | string;

function toDate(value: DateValue): Date {
  return typeof value === "string" ? new Date(value) : value;
}

export function formatInstantInTimeZone(
  value: DateValue,
  pattern: string,
  timeZone: string,
): string {
  return format(new TZDate(toDate(value), timeZone), pattern);
}

/**
 * Returns a browser-local Date whose visible year/month/day matches the
 * calendar date at the center. Use it only for date-picker state.
 */
export function getPickerDateInTimeZone(
  value: DateValue,
  timeZone: string,
): Date {
  const zoned = new TZDate(toDate(value), timeZone);
  return new Date(zoned.getFullYear(), zoned.getMonth(), zoned.getDate());
}

export function getPickerDateKey(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function getInstantCalendarDateKey(
  value: DateValue,
  timeZone: string,
): string {
  const zoned = new TZDate(toDate(value), timeZone);
  const year = zoned.getFullYear();
  const month = String(zoned.getMonth() + 1).padStart(2, "0");
  const day = String(zoned.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function isInstantOnPickerDate(
  value: DateValue,
  pickerDate: Date,
  timeZone: string,
): boolean {
  return (
    getInstantCalendarDateKey(value, timeZone) ===
    getPickerDateKey(pickerDate)
  );
}

export function combinePickerDateAndTime(
  date: Date,
  time: string,
  timeZone: string,
): Date {
  const [hours, minutes] = time.split(":").map(Number);
  const zoned = new TZDate(
    date.getFullYear(),
    date.getMonth(),
    date.getDate(),
    hours,
    minutes,
    0,
    0,
    timeZone,
  );
  return new Date(zoned.getTime());
}
