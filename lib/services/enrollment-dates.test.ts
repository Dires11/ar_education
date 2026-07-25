import { describe, expect, it } from "vitest";
import { resolveEnrollmentEndDate } from "@/lib/services/enrollment-dates";

const now = new Date("2026-07-25T18:00:00.000Z");

describe("enrollment end-date policy", () => {
  it("sets today as the cutoff when an enrollment becomes terminal", () => {
    expect(
      resolveEnrollmentEndDate({
        status: "CANCELLED",
        startDate: new Date("2026-01-01T00:00:00.000Z"),
        currentEndDate: null,
        now,
      })?.toISOString(),
    ).toBe("2026-07-25T00:00:00.000Z");
  });

  it("uses the center's calendar date near a UTC date boundary", () => {
    expect(
      resolveEnrollmentEndDate({
        status: "CANCELLED",
        startDate: new Date("2026-01-01T00:00:00.000Z"),
        currentEndDate: null,
        now: new Date("2026-07-26T02:00:00.000Z"),
      })?.toISOString(),
    ).toBe("2026-07-25T00:00:00.000Z");
  });

  it("preserves an earlier existing cutoff", () => {
    expect(
      resolveEnrollmentEndDate({
        status: "COMPLETED",
        startDate: new Date("2026-01-01T00:00:00.000Z"),
        currentEndDate: new Date("2026-07-01T00:00:00.000Z"),
        now,
      })?.toISOString(),
    ).toBe("2026-07-01T00:00:00.000Z");
  });

  it("rejects a future terminal cutoff", () => {
    expect(() =>
      resolveEnrollmentEndDate({
        status: "COMPLETED",
        startDate: new Date("2026-01-01T00:00:00.000Z"),
        currentEndDate: null,
        requestedEndDate: new Date("2026-07-26T00:00:00.000Z"),
        now,
      }),
    ).toThrow("cannot end in the future");
  });

  it("does not invent a cutoff for an active enrollment", () => {
    expect(
      resolveEnrollmentEndDate({
        status: "ACTIVE",
        startDate: new Date("2026-01-01T00:00:00.000Z"),
        currentEndDate: null,
        now,
      }),
    ).toBeUndefined();
  });
});
