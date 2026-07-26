import {
  getCalendarDateInTimeZone,
  getConfiguredCenterTimeZone,
} from "@/lib/services/session-dates";

type EnrollmentStatus = "ACTIVE" | "PAUSED" | "COMPLETED" | "CANCELLED";

export function resolveEnrollmentEndDate(input: {
  status: EnrollmentStatus;
  currentStatus: EnrollmentStatus;
  startDate: Date;
  currentEndDate: Date | null;
  requestedEndDate?: Date;
  now?: Date;
  timeZone?: string;
}): Date | null | undefined {
  if (
    input.requestedEndDate &&
    input.requestedEndDate < input.startDate
  ) {
    throw new Error("End date must be on or after the start date");
  }

  if (input.status !== "COMPLETED" && input.status !== "CANCELLED") {
    if (input.requestedEndDate) return input.requestedEndDate;

    // A terminal cutoff is lifecycle state, not an enduring scheduling
    // preference. Clear it when a completed/cancelled enrollment is reopened.
    if (
      input.currentStatus === "COMPLETED" ||
      input.currentStatus === "CANCELLED"
    ) {
      return null;
    }

    // Preserve an intentional cutoff on an already-active/paused enrollment
    // when a status-only edit does not include endDate.
    return undefined;
  }

  const today = getCalendarDateInTimeZone(
    input.now ?? new Date(),
    input.timeZone ?? getConfiguredCenterTimeZone(),
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
  return endDate;
}
