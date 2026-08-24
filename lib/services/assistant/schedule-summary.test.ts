import { describe, expect, it } from "vitest";
import { summarizeAssistantWeekSchedule } from "@/lib/services/assistant/schedule-summary";

describe("assistant weekly schedule summary", () => {
  it("counts materialized and virtual sessions in tutor and weekday totals", () => {
    const summary = summarizeAssistantWeekSchedule(
      [
        {
          scheduledFor: new Date("2026-08-24T17:00:00.000Z"),
          tutor: { id: "tutor-1", firstName: "Ada", lastName: "Lovelace" },
        },
        {
          scheduledFor: "2026-08-25T17:00:00.000Z",
          tutor: { id: "tutor-1", firstName: "Ada", lastName: "Lovelace" },
        },
        {
          scheduledFor: "2026-08-25T18:00:00.000Z",
          tutor: { id: "tutor-2", firstName: "Grace", lastName: "Hopper" },
        },
      ],
      "America/Los_Angeles",
    );

    expect(summary.tutorCounts).toEqual([
      { name: "Ada Lovelace", count: 2 },
      { name: "Grace Hopper", count: 1 },
    ]);
    expect(summary.weeklySessionsByDay).toEqual(
      expect.arrayContaining([
        { day: "Mon", sessions: 1 },
        { day: "Tue", sessions: 2 },
      ]),
    );
  });
});
