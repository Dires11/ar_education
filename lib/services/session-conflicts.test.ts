import { beforeEach, describe, expect, it, vi } from "vitest";

const sessionData = vi.hoisted(() => ({
  getSessionsForConflictWindow: vi.fn(),
  getRecurringSchedulesForConflictWindow: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/data/sessions", () => sessionData);

import { assertNoRecurringScheduleConflict } from "@/lib/services/session-conflicts";

const proposedSchedule = {
  tutorId: "tutor-1",
  subjectId: "subject-1",
  students: [{
    id: "student-1",
    firstName: "Ada",
    lastName: "Lovelace",
  }],
  daysOfWeek: [1],
  startTime: "09:00",
  durationMinutes: 60,
  intervalWeeks: 1,
  startsOn: new Date("2026-01-05T00:00:00.000Z"),
  timeZone: "America/Los_Angeles",
};

describe("recurring schedule conflict horizon", () => {
  beforeEach(() => {
    sessionData.getSessionsForConflictWindow.mockReset();
    sessionData.getRecurringSchedulesForConflictWindow.mockReset();
    sessionData.getSessionsForConflictWindow.mockResolvedValue([]);
    sessionData.getRecurringSchedulesForConflictWindow.mockResolvedValue([]);
  });

  it("detects a real session more than 90 days in the future", async () => {
    sessionData.getSessionsForConflictWindow.mockResolvedValue([{
      id: "session-1",
      tutorId: "tutor-1",
      subjectId: "subject-1",
      scheduledFor: new Date("2026-07-06T16:00:00.000Z"),
      durationMinutes: 60,
      recurrenceRuleId: null,
      status: "SCHEDULED",
      tutor: { firstName: "Grace", lastName: "Hopper" },
      subject: { name: "Mathematics" },
      attendance: [],
      enrollment: null,
    }]);

    await expect(
      assertNoRecurringScheduleConflict(proposedSchedule),
    ).rejects.toThrow("Grace Hopper is already teaching");
  });

  it("detects a recurring rule whose first collision is after 90 days", async () => {
    sessionData.getRecurringSchedulesForConflictWindow.mockResolvedValue([{
      id: "rule-1",
      enrollmentId: "enrollment-1",
      groupId: null,
      dayOfWeek: 1,
      startTime: "09:00",
      timeZone: "America/Los_Angeles",
      durationMinutes: 60,
      intervalWeeks: 52,
      startsOn: new Date("2027-01-04T00:00:00.000Z"),
      endsOn: null,
      room: null,
      color: null,
      enrollment: {
        id: "enrollment-1",
        studentId: "student-2",
        tutorId: "tutor-1",
        subjectId: "subject-1",
        startDate: new Date("2027-01-04T00:00:00.000Z"),
        endDate: null,
        status: "ACTIVE",
        tutor: { firstName: "Grace", lastName: "Hopper" },
        subject: { name: "Mathematics" },
        student: {
          id: "student-2",
          firstName: "Katherine",
          lastName: "Johnson",
        },
      },
      group: null,
    }]);

    await expect(
      assertNoRecurringScheduleConflict(proposedSchedule),
    ).rejects.toThrow("Grace Hopper is already teaching");
  });
});
