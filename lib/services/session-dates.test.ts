import { describe, expect, it } from "vitest";
import {
  addCalendarDays,
  combineDateAndTime,
  getCalendarDateKey,
  getCalendarDateStart,
  getCalendarMonthKey,
  getCalendarMonthRange,
  getCalendarWeekRange,
  getFirstMatchingDate,
  getFirstRecurrenceOnOrAfter,
  getSessionConflictWindow,
  sessionRangesOverlap,
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

  it("builds month boundaries in the center time zone", () => {
    const range = getCalendarMonthRange(
      "2026-01",
      "America/Los_Angeles",
    );

    expect(range.calendarStart.toISOString()).toBe(
      "2026-01-01T00:00:00.000Z",
    );
    expect(range.calendarEnd.toISOString()).toBe(
      "2026-01-31T00:00:00.000Z",
    );
    expect(range.start.toISOString()).toBe("2026-01-01T08:00:00.000Z");
    expect(range.endExclusive.toISOString()).toBe(
      "2026-02-01T08:00:00.000Z",
    );
  });

  it("assigns late center-time sessions to their local calendar month", () => {
    expect(
      getCalendarMonthKey(
        new Date("2026-02-01T04:00:00.000Z"),
        "America/Los_Angeles",
      ),
    ).toBe("2026-01");
  });

  it("uses the correct offset on each side of a DST-changing month", () => {
    const range = getCalendarMonthRange(
      "2026-03",
      "America/Los_Angeles",
    );

    expect(range.start.toISOString()).toBe("2026-03-01T08:00:00.000Z");
    expect(range.endExclusive.toISOString()).toBe(
      "2026-04-01T07:00:00.000Z",
    );
  });

  it("stores date-only values at the start of the center-local day", () => {
    expect(
      getCalendarDateStart(
        "2026-07-01",
        "America/Los_Angeles",
      ).toISOString(),
    ).toBe("2026-07-01T07:00:00.000Z");
  });

  it("looks back far enough to find overnight session conflicts", () => {
    const window = getSessionConflictWindow(
      new Date("2026-07-02T07:15:00.000Z"),
      60,
    );

    expect(window.start.toISOString()).toBe("2026-07-01T23:15:00.000Z");
    expect(window.endExclusive.toISOString()).toBe(
      "2026-07-02T08:15:00.000Z",
    );
  });

  it("detects overlaps across midnight without treating touching ranges as conflicts", () => {
    const previousNight = new Date("2026-07-02T06:30:00.000Z");
    const afterMidnight = new Date("2026-07-02T07:15:00.000Z");

    expect(
      sessionRangesOverlap(previousNight, 120, afterMidnight, 60),
    ).toBe(true);
    expect(
      sessionRangesOverlap(previousNight, 45, afterMidnight, 60),
    ).toBe(false);
  });

  it("builds Monday-through-Sunday week boundaries in center time", () => {
    const range = getCalendarWeekRange(
      new Date("2026-03-12T02:00:00.000Z"),
      "America/Los_Angeles",
    );

    expect(range.calendarStart.toISOString()).toBe(
      "2026-03-09T00:00:00.000Z",
    );
    expect(range.calendarEnd.toISOString()).toBe(
      "2026-03-15T00:00:00.000Z",
    );
    expect(range.start.toISOString()).toBe("2026-03-09T07:00:00.000Z");
    expect(range.endExclusive.toISOString()).toBe(
      "2026-03-16T07:00:00.000Z",
    );
  });
});
