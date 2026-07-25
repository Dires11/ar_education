import { describe, expect, it } from "vitest";
import { Prisma } from "../../generated/prisma";
import {
  applyDiscounts,
  calculateEnrollmentCharges,
  type DiscountRow,
} from "@/lib/services/pricing-calculator";

function discount(
  kind: DiscountRow["kind"],
  value: number,
): DiscountRow {
  return {
    kind,
    value: new Prisma.Decimal(value),
    temporary: false,
    validFrom: null,
    validUntil: null,
    usesRemaining: null,
  };
}

describe("pricing calculations", () => {
  it("applies free sessions only to the configured first sessions", () => {
    const freeSessions = [
      discount("FREE_SESSIONS", 2),
      discount("REDUCED_RATE", 25),
    ];
    const base = new Prisma.Decimal(50);

    expect(
      applyDiscounts(base, freeSessions, { sessionNumber: 1 }).toNumber(),
    ).toBe(0);
    expect(
      applyDiscounts(base, freeSessions, { sessionNumber: 3 }).toNumber(),
    ).toBe(25);
  });

  it("applies a free month once instead of zeroing every period", () => {
    const freeMonth = [discount("FREE_MONTH", 1)];
    const base = new Prisma.Decimal(200);

    expect(
      applyDiscounts(base, freeMonth, { billingPeriodIndex: 0 }).toNumber(),
    ).toBe(0);
    expect(
      applyDiscounts(base, freeMonth, { billingPeriodIndex: 1 }).toNumber(),
    ).toBe(200);
  });

  it("stops subscription charges at the enrollment end date", () => {
    const charge = calculateEnrollmentCharges(
      {
        startDate: new Date("2026-01-01T00:00:00.000Z"),
        endDate: new Date("2026-03-31T00:00:00.000Z"),
        status: "COMPLETED",
        updatedAt: new Date("2026-03-31T12:00:00.000Z"),
        priceAtEnrollment: new Prisma.Decimal(100),
        customPriceOverride: null,
        package: { type: "MONTHLY", billingPeriod: "MONTHLY" },
        discounts: [],
        sessionAttendance: [],
      },
      new Date("2026-07-25T00:00:00.000Z"),
    );

    expect(charge.toNumber()).toBe(300);
  });

  it("uses the terminal status update as the cutoff for legacy enrollments", () => {
    const charge = calculateEnrollmentCharges(
      {
        startDate: new Date("2026-01-01T00:00:00.000Z"),
        endDate: null,
        status: "CANCELLED",
        updatedAt: new Date("2026-03-15T18:00:00.000Z"),
        priceAtEnrollment: new Prisma.Decimal(100),
        customPriceOverride: null,
        package: { type: "MONTHLY", billingPeriod: "MONTHLY" },
        discounts: [],
        sessionAttendance: [],
      },
      new Date("2026-07-25T00:00:00.000Z"),
    );

    expect(charge.toNumber()).toBe(300);
  });

  it("does not bill per-session attendance after termination", () => {
    const charge = calculateEnrollmentCharges(
      {
        startDate: new Date("2026-01-01T00:00:00.000Z"),
        endDate: null,
        status: "COMPLETED",
        updatedAt: new Date("2026-03-15T09:00:00.000Z"),
        priceAtEnrollment: new Prisma.Decimal(50),
        customPriceOverride: null,
        package: { type: "PER_SESSION", billingPeriod: "MONTHLY" },
        discounts: [],
        sessionAttendance: [
          { session: { scheduledFor: new Date("2026-03-15T20:00:00.000Z") } },
          { session: { scheduledFor: new Date("2026-03-16T20:00:00.000Z") } },
        ],
      },
      new Date("2026-07-25T00:00:00.000Z"),
    );

    expect(charge.toNumber()).toBe(50);
  });
});
