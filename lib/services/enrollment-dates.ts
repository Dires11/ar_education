import {
  DEFAULT_CENTER_TIME_ZONE,
  getCalendarDateInTimeZone,
} from "@/lib/services/session-dates";

type EnrollmentStatus = "ACTIVE" | "PAUSED" | "COMPLETED" | "CANCELLED";

export function resolveEnrollmentEndDate(input: {
  status: EnrollmentStatus;
  startDate: Date;
  currentEndDate: Date | null;
  requestedEndDate?: Date;
  now?: Date;
}): Date | undefined {
  if (input.status !== "COMPLETED" && input.status !== "CANCELLED") {
    return input.requestedEndDate;
  }

  const today = getCalendarDateInTimeZone(
    input.now ?? new Date(),
    DEFAULT_CENTER_TIME_ZONE,
  );
  if (input.requestedEndDate && input.requestedEndDate > today) {
    throw new Error(
      "A completed or cancelled enrollment cannot end in the future",
    );
  }

  const endDate =
    input.requestedEndDate ??
    (input.currentEndDate && input.currentEndDate < today
      ? input.currentEndDate
      : today);
  if (endDate < input.startDate) {
    throw new Error("End date must be on or after the start date");
  }
  return endDate;
}
