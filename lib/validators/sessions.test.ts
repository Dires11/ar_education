import { describe, expect, it } from "vitest";
import {
  createRecurrenceSchema,
  updateSessionSchema,
} from "@/lib/validators/sessions";

const validRecurrence = {
  enrollmentId: "enrollment_1",
  daysOfWeek: ["1"] as const,
  startTime: "16:30",
  durationMinutes: "60",
  intervalWeeks: "1",
  startsOn: "2026-07-27",
};

describe("session validation", () => {
  it("rejects a zero recurrence interval", () => {
    expect(
      createRecurrenceSchema.safeParse({
        ...validRecurrence,
        intervalWeeks: "0",
      }).success,
    ).toBe(false);
  });

  it("requires exactly one recurrence owner", () => {
    expect(
      createRecurrenceSchema.safeParse({
        ...validRecurrence,
        groupId: "group_1",
      }).success,
    ).toBe(false);
  });

  it("rejects empty session updates and invalid durations", () => {
    expect(updateSessionSchema.safeParse({}).success).toBe(false);
    expect(
      updateSessionSchema.safeParse({ durationMinutes: 0 }).success,
    ).toBe(false);
  });
});
