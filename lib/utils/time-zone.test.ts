import { describe, expect, it } from "vitest";
import {
  combinePickerDateAndTime,
  formatInstantInTimeZone,
  getPickerDateInTimeZone,
  isInstantOnPickerDate,
} from "@/lib/utils/time-zone";

describe("browser-safe center time-zone helpers", () => {
  it("groups a UTC-next-day instant on the prior Pacific calendar day", () => {
    const pickerDate = new Date(2026, 6, 25);

    expect(
      isInstantOnPickerDate(
        "2026-07-26T06:30:00.000Z",
        pickerDate,
        "America/Los_Angeles",
      ),
    ).toBe(true);
  });

  it("creates the intended center-local wall time regardless of browser zone", () => {
    const pickerDate = new Date(2026, 6, 25);

    expect(
      combinePickerDateAndTime(
        pickerDate,
        "23:30",
        "America/Los_Angeles",
      ).toISOString(),
    ).toBe("2026-07-26T06:30:00.000Z");
  });

  it("returns date-picker state and labels in the center time zone", () => {
    const instant = new Date("2026-07-26T06:30:00.000Z");
    const pickerDate = getPickerDateInTimeZone(
      instant,
      "America/Los_Angeles",
    );

    expect([
      pickerDate.getFullYear(),
      pickerDate.getMonth(),
      pickerDate.getDate(),
    ]).toEqual([2026, 6, 25]);
    expect(
      formatInstantInTimeZone(
        instant,
        "MMM d, yyyy h:mm a",
        "America/Los_Angeles",
      ),
    ).toBe("Jul 25, 2026 11:30 PM");
  });
});
