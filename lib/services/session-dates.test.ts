import { describe, expect, it } from "vitest";
import {
  addCalendarDays,
  combineDateAndTime,
  getCalendarDateKey,
  getFirstMatchingDate,
  getFirstRecurrenceOnOrAfter,
} from "@/lib/services/session-dates";

describe("session date calculations", () => {
  it("preserves the local wall-clock hour across daylight-saving changes", () => {
    const beforeDst = combineDateAndTime(
      new Date("2026-03-07T00:00:00.000Z"),
      "10:00",
      "America/Los_Angeles",
    );
    const afterDst = combineDateAndTime(
      new Date("2026-03-14T00:00:00.000Z"),
      "10:00",
      "America/Los_Angeles",
    );

    expect(beforeDst.toISOString()).toBe("2026-03-07T18:00:00.000Z");
    expect(afterDst.toISOString()).toBe("2026-03-14T17:00:00.000Z");
  });

  it("advances recurrence dates by calendar days", () => {
    const start = new Date("2026-03-01T00:00:00.000Z");
    expect(getCalendarDateKey(addCalendarDays(start, 14), "UTC")).toBe(
      "2026-03-15",
    );
  });

  it("finds the first requested weekday on or after the start date", () => {
    const firstMonday = getFirstMatchingDate(
      new Date("2026-07-25T00:00:00.000Z"),
      1,
    );
    expect(firstMonday.toISOString()).toBe("2026-07-27T00:00:00.000Z");
  });

  it("preserves the interval phase when advancing into a later window", () => {
    const occurrence = getFirstRecurrenceOnOrAfter(
      new Date("2026-07-06T00:00:00.000Z"),
      1,
      2,
      new Date("2026-07-13T00:00:00.000Z"),
    );
    expect(occurrence.toISOString()).toBe("2026-07-20T00:00:00.000Z");
  });
});
