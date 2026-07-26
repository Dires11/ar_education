import { describe, expect, it } from "vitest";
import { Prisma } from "../../generated/prisma";
import {
  applyDiscounts,
  calculateOutstandingAmount,
  calculateEnrollmentCharges,
  getPaidBillingMonths,
  getValidatedBillingPeriod,
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

  it("applies a discount through the end of its final center-local day", () => {
    const finalDayDiscount = {
      ...discount("PERCENT_OFF", 50),
      validUntil: new Date("2026-07-25T00:00:00.000Z"),
    };
    const base = new Prisma.Decimal(100);

    expect(
      applyDiscounts(base, [finalDayDiscount], {
        date: new Date("2026-07-26T06:30:00.000Z"),
        timeZone: "America/Los_Angeles",
      }).toNumber(),
    ).toBe(50);
    expect(
      applyDiscounts(base, [finalDayDiscount], {
        date: new Date("2026-07-26T07:30:00.000Z"),
        timeZone: "America/Los_Angeles",
      }).toNumber(),
    ).toBe(100);
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

  it("bills evening sessions on the final center-local enrollment day", () => {
    const charge = calculateEnrollmentCharges(
      {
        startDate: new Date("2026-01-01T00:00:00.000Z"),
        endDate: new Date("2026-03-15T00:00:00.000Z"),
        status: "COMPLETED",
        updatedAt: new Date("2026-03-16T05:00:00.000Z"),
        priceAtEnrollment: new Prisma.Decimal(50),
        customPriceOverride: null,
        package: { type: "PER_SESSION", billingPeriod: "MONTHLY" },
        discounts: [],
        sessionAttendance: [
          { session: { scheduledFor: new Date("2026-03-16T06:30:00.000Z") } },
          { session: { scheduledFor: new Date("2026-03-16T07:30:00.000Z") } },
        ],
      },
      new Date("2026-07-25T00:00:00.000Z"),
      "America/Los_Angeles",
    );

    expect(charge.toNumber()).toBe(50);
  });

  it("subtracts partial payments from the amount still due", () => {
    const outstanding = calculateOutstandingAmount(
      new Prisma.Decimal(100),
      [new Prisma.Decimal(30), new Prisma.Decimal(20)],
    );

    expect(outstanding.toFixed(2)).toBe("50.00");
  });

  it("does not return a negative balance for overpayments", () => {
    const outstanding = calculateOutstandingAmount(
      new Prisma.Decimal(100),
      [new Prisma.Decimal(120)],
    );

    expect(outstanding.toFixed(2)).toBe("0.00");
  });

  it("marks a zero-charge billing period paid without a payment row", () => {
    const paidMonths = getPaidBillingMonths(
      {
        startDate: new Date("2026-01-01T00:00:00.000Z"),
        endDate: null,
        status: "ACTIVE",
        updatedAt: new Date("2026-01-01T00:00:00.000Z"),
        priceAtEnrollment: new Prisma.Decimal(100),
        customPriceOverride: null,
        package: { type: "MONTHLY", billingPeriod: "MONTHLY" },
        discounts: [discount("FREE_MONTH", 1)],
        payments: [],
      },
      ["2026-01", "2026-02"],
      "America/Los_Angeles",
    );

    expect(paidMonths).toEqual(["2026-01"]);
  });

  it("carries one paid annual billing period across its covered months", () => {
    const paidMonths = getPaidBillingMonths(
      {
        startDate: new Date("2026-02-01T00:00:00.000Z"),
        endDate: null,
        status: "ACTIVE",
        updatedAt: new Date("2026-02-01T00:00:00.000Z"),
        priceAtEnrollment: new Prisma.Decimal(1200),
        customPriceOverride: null,
        package: { type: "MONTHLY", billingPeriod: "YEARLY" },
        discounts: [],
        payments: [
          {
            coversMonth: "2026-02",
            amount: new Prisma.Decimal(1200),
          },
        ],
      },
      ["2026-02", "2026-07", "2027-01", "2027-02"],
      "America/Los_Angeles",
    );

    expect(paidMonths).toEqual(["2026-02", "2026-07", "2027-01"]);
  });

  it("accepts only aligned billing-period start months", () => {
    const enrollment = {
      startDate: new Date("2026-02-15T00:00:00.000Z"),
      endDate: null,
      status: "ACTIVE" as const,
      updatedAt: new Date("2026-02-15T00:00:00.000Z"),
      package: {
        type: "MONTHLY" as const,
        billingPeriod: "THREE_MONTHS" as const,
      },
    };

    expect(
      getValidatedBillingPeriod(
        enrollment,
        "2026-05",
        "America/Los_Angeles",
      ).billingPeriodIndex,
    ).toBe(1);
    expect(() =>
      getValidatedBillingPeriod(
        enrollment,
        "2026-04",
        "America/Los_Angeles",
      ),
    ).toThrow("not a billing period");
  });

  it("rejects billing periods outside enrollment bounds", () => {
    const enrollment = {
      startDate: new Date("2026-02-01T00:00:00.000Z"),
      endDate: new Date("2026-06-30T00:00:00.000Z"),
      status: "ACTIVE" as const,
      updatedAt: new Date("2026-02-01T00:00:00.000Z"),
      package: {
        type: "MONTHLY" as const,
        billingPeriod: "MONTHLY" as const,
      },
    };

    expect(() =>
      getValidatedBillingPeriod(enrollment, "2026-01"),
    ).toThrow("before the enrollment");
    expect(() =>
      getValidatedBillingPeriod(enrollment, "2026-07"),
    ).toThrow("after the enrollment");
  });

  it("rejects monthly allocation for per-session packages", () => {
    expect(() =>
      getValidatedBillingPeriod(
        {
          startDate: new Date("2026-01-01T00:00:00.000Z"),
          endDate: null,
          status: "ACTIVE",
          updatedAt: new Date("2026-01-01T00:00:00.000Z"),
          package: {
            type: "PER_SESSION",
            billingPeriod: "MONTHLY",
          },
        },
        "2026-01",
      ),
    ).toThrow("Only subscription enrollments");
  });
});
