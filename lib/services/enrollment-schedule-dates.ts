import {
  getCalendarDateInTimeZone,
  getConfiguredCenterTimeZone,
} from "@/lib/services/session-dates";

type EnrollmentScheduleBounds = {
  startDate: Date;
  endDate: Date | null;
  status: "ACTIVE" | "PAUSED" | "COMPLETED" | "CANCELLED";
};

export function isEnrollmentEligibleOnCalendarDate(
  enrollment: EnrollmentScheduleBounds,
  calendarDate: Date,
): boolean {
  return (
    (enrollment.status === "ACTIVE" || enrollment.status === "PAUSED") &&
    calendarDate >= enrollment.startDate &&
    (!enrollment.endDate || calendarDate <= enrollment.endDate)
  );
}

export function isEnrollmentEligibleForSession(
  enrollment: EnrollmentScheduleBounds,
  scheduledFor: Date,
  timeZone = getConfiguredCenterTimeZone(),
): boolean {
  return isEnrollmentEligibleOnCalendarDate(
    enrollment,
    getCalendarDateInTimeZone(scheduledFor, timeZone),
  );
}

export function assertEnrollmentEligibleOnCalendarDate(
  enrollment: EnrollmentScheduleBounds,
  calendarDate: Date,
) {
  if (enrollment.status !== "ACTIVE" && enrollment.status !== "PAUSED") {
    throw new Error("This enrollment is not active");
  }
  assertSessionDateWithinEnrollmentBounds(enrollment, calendarDate);
}

export function assertSessionDateWithinEnrollmentBounds(
  enrollment: Pick<EnrollmentScheduleBounds, "startDate" | "endDate">,
  calendarDate: Date,
) {
  if (calendarDate < enrollment.startDate) {
    throw new Error("The session date is before the enrollment starts");
  }
  if (enrollment.endDate && calendarDate > enrollment.endDate) {
    throw new Error("The session date is after the enrollment ends");
  }
}

export function assertEnrollmentEligibleForSession(
  enrollment: EnrollmentScheduleBounds,
  scheduledFor: Date,
  timeZone = getConfiguredCenterTimeZone(),
) {
  assertEnrollmentEligibleOnCalendarDate(
    enrollment,
    getCalendarDateInTimeZone(scheduledFor, timeZone),
  );
}
