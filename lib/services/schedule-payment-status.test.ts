import { describe, expect, it } from "vitest";
import { getSchedulePaymentStatus } from "@/lib/services/schedule-payment-status";

describe("schedule payment status", () => {
  const subscriptionEnrollmentIds = new Set(["monthly"]);
  const paidMonths = new Set(["monthly:2026-07"]);

  it("returns null for per-session or group sessions", () => {
    expect(
      getSchedulePaymentStatus({
        enrollmentId: "per-session",
        monthKey: "2026-07",
        subscriptionEnrollmentIds,
        paidMonths,
      }),
    ).toBeNull();
    expect(
      getSchedulePaymentStatus({
        enrollmentId: null,
        monthKey: "2026-07",
        subscriptionEnrollmentIds,
        paidMonths,
      }),
    ).toBeNull();
  });

  it("returns a billing status only for subscription enrollments", () => {
    expect(
      getSchedulePaymentStatus({
        enrollmentId: "monthly",
        monthKey: "2026-07",
        subscriptionEnrollmentIds,
        paidMonths,
      }),
    ).toBe(true);
    expect(
      getSchedulePaymentStatus({
        enrollmentId: "monthly",
        monthKey: "2026-08",
        subscriptionEnrollmentIds,
        paidMonths,
      }),
    ).toBe(false);
  });
});
