import { beforeEach, describe, expect, it, vi } from "vitest";

const sessionData = vi.hoisted(() => ({
  createRecurrenceRules: vi.fn(),
  getEnrollmentForSession: vi.fn(),
}));
const conflictService = vi.hoisted(() => ({
  assertNoRecurringScheduleConflict: vi.fn(),
}));
const capacityService = vi.hoisted(() => ({
  getRecurringSchedulePreview: vi.fn(),
}));
const materializationService = vi.hoisted(() => ({
  materializeGroupSessions: vi.fn(),
  materializeSessions: vi.fn(),
}));

vi.mock("@/lib/data/sessions", () => sessionData);
vi.mock("@/lib/data/groups", () => ({ getGroupWithMembers: vi.fn() }));
vi.mock("@/lib/services/payments", () => ({
  getEnrollmentPaidMonths: vi.fn(),
}));
vi.mock("@/lib/services/session-conflicts", () => conflictService);
vi.mock("@/lib/services/session-capacity", () => capacityService);
vi.mock("@/lib/services/session-materialization", () => materializationService);
vi.mock("@/lib/services/enrollment-schedule-dates", () => ({
  assertEnrollmentEligibleForSession: vi.fn(),
  assertEnrollmentEligibleOnCalendarDate: vi.fn(),
  assertSessionDateWithinEnrollmentBounds: vi.fn(),
  isEnrollmentEligibleForSession: vi.fn(() => true),
  isEnrollmentEligibleOnCalendarDate: vi.fn(() => true),
}));

import { createRecurringSchedule } from "@/lib/services/sessions";

describe("recurring schedule creation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    sessionData.getEnrollmentForSession.mockResolvedValue({
      id: "enrollment-1",
      studentId: "student-1",
      tutorId: "tutor-1",
      subjectId: "subject-1",
      startDate: new Date("2099-01-01T00:00:00.000Z"),
      endDate: null,
      status: "ACTIVE",
      student: {
        id: "student-1",
        firstName: "Ada",
        lastName: "Lovelace",
      },
    });
    sessionData.createRecurrenceRules.mockResolvedValue([{ id: "rule-1" }]);
    capacityService.getRecurringSchedulePreview.mockResolvedValue({
      firstExceededDate: null,
    });
    conflictService.assertNoRecurringScheduleConflict.mockResolvedValue(
      undefined,
    );
    materializationService.materializeSessions.mockResolvedValue(3);
    materializationService.materializeGroupSessions.mockResolvedValue(0);
  });

  it("reports success with a warning when post-create materialization fails", async () => {
    materializationService.materializeSessions.mockRejectedValueOnce(
      new Error("database unavailable"),
    );

    const result = await createRecurringSchedule({
      enrollmentId: "enrollment-1",
      daysOfWeek: ["1"],
      startTime: "15:30",
      durationMinutes: "60",
      startsOn: "2099-01-05",
    });

    expect(sessionData.createRecurrenceRules).toHaveBeenCalledTimes(1);
    expect(result).toMatchObject({
      rulesCreated: 1,
      materializedSessions: 0,
      warnings: [expect.stringContaining("recurring schedule was created")],
    });
    expect(
      materializationService.materializeGroupSessions,
    ).toHaveBeenCalledTimes(1);
  });
});
