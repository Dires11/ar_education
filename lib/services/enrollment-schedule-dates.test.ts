import { describe, expect, it } from "vitest";
import {
  assertEnrollmentEligibleOnCalendarDate,
  isEnrollmentEligibleForSession,
  isEnrollmentEligibleOnCalendarDate,
} from "@/lib/services/enrollment-schedule-dates";

const enrollment = {
  startDate: new Date("2026-07-10T00:00:00.000Z"),
  endDate: new Date("2026-07-20T00:00:00.000Z"),
  status: "ACTIVE" as const,
};

describe("enrollment schedule boundaries", () => {
  it("includes both date-only enrollment boundaries", () => {
    expect(
      isEnrollmentEligibleOnCalendarDate(
        enrollment,
        new Date("2026-07-10T00:00:00.000Z"),
      ),
    ).toBe(true);
    expect(
      isEnrollmentEligibleOnCalendarDate(
        enrollment,
        new Date("2026-07-20T00:00:00.000Z"),
      ),
    ).toBe(true);
  });

  it("excludes dates before the start and after the end", () => {
    expect(
      isEnrollmentEligibleOnCalendarDate(
        enrollment,
        new Date("2026-07-09T00:00:00.000Z"),
      ),
    ).toBe(false);
    expect(
      isEnrollmentEligibleOnCalendarDate(
        enrollment,
        new Date("2026-07-21T00:00:00.000Z"),
      ),
    ).toBe(false);
  });

  it("uses the center-local date for session instants", () => {
    expect(
      isEnrollmentEligibleForSession(
        enrollment,
        new Date("2026-07-21T06:30:00.000Z"),
        "America/Los_Angeles",
      ),
    ).toBe(true);
  });

  it("rejects terminal enrollments even inside their date range", () => {
    expect(() =>
      assertEnrollmentEligibleOnCalendarDate(
        { ...enrollment, status: "COMPLETED" },
        new Date("2026-07-15T00:00:00.000Z"),
      ),
    ).toThrow("not active");
  });
});
