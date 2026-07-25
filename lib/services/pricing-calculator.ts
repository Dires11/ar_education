import { Prisma } from "../../generated/prisma";

export type DiscountRow = {
  kind:
    | "PERCENT_OFF"
    | "FIXED_OFF"
    | "FREE_SESSIONS"
    | "FREE_MONTH"
    | "REDUCED_RATE";
  value: Prisma.Decimal;
  temporary: boolean;
  validFrom: Date | null;
  validUntil: Date | null;
  usesRemaining: number | null;
};

export function billingPeriodMonths(
  period: "MONTHLY" | "THREE_MONTHS" | "YEARLY",
) {
  if (period === "YEARLY") return 12;
  if (period === "THREE_MONTHS") return 3;
  return 1;
}

export function startOfBillingMonth(date: Date) {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1));
}

export function addBillingMonths(date: Date, months: number) {
  return new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + months, 1),
  );
}

export function billingMonthDifference(later: Date, earlier: Date) {
  return (
    (later.getUTCFullYear() - earlier.getUTCFullYear()) * 12 +
    later.getUTCMonth() -
    earlier.getUTCMonth()
  );
}

export function applyDiscounts(
  basePrice: Prisma.Decimal,
  discounts: DiscountRow[],
  context: {
    date?: Date;
    sessionNumber?: number;
    billingPeriodIndex?: number;
  } = {},
): Prisma.Decimal {
  const chargeDate = context.date ?? new Date();
  let price = basePrice;
  let isFree = false;

  for (const discount of discounts) {
    if (discount.validFrom && chargeDate < discount.validFrom) continue;
    if (discount.validUntil && chargeDate > discount.validUntil) continue;

    const chargeNumber =
      context.sessionNumber ??
      (context.billingPeriodIndex !== undefined
        ? context.billingPeriodIndex + 1
        : undefined);
    if (
      discount.temporary &&
      discount.usesRemaining !== null &&
      (discount.usesRemaining <= 0 ||
        (chargeNumber !== undefined && chargeNumber > discount.usesRemaining))
    ) {
      continue;
    }

    switch (discount.kind) {
      case "PERCENT_OFF":
        price = price.mul(
          new Prisma.Decimal(1).sub(discount.value.div(100)),
        );
        break;
      case "FIXED_OFF":
        price = Prisma.Decimal.max(
          new Prisma.Decimal(0),
          price.sub(discount.value),
        );
        break;
      case "REDUCED_RATE":
        price = discount.value;
        break;
      case "FREE_SESSIONS": {
        const freeSessions = Math.max(0, Math.floor(discount.value.toNumber()));
        if (
          context.sessionNumber !== undefined &&
          context.sessionNumber <= freeSessions
        ) {
          isFree = true;
        }
        break;
      }
      case "FREE_MONTH": {
        const appliesToThisPeriod = discount.validFrom
          ? chargeDate.getFullYear() === discount.validFrom.getFullYear() &&
            chargeDate.getMonth() === discount.validFrom.getMonth()
          : context.billingPeriodIndex === 0;
        if (appliesToThisPeriod) isFree = true;
        break;
      }
    }
  }

  return isFree ? new Prisma.Decimal(0) : price;
}

export type EnrollmentForPricing = {
  startDate: Date;
  endDate: Date | null;
  priceAtEnrollment: Prisma.Decimal;
  customPriceOverride: Prisma.Decimal | null;
  package: {
    type: "MONTHLY" | "PER_SESSION";
    billingPeriod: "MONTHLY" | "THREE_MONTHS" | "YEARLY";
  };
  discounts: DiscountRow[];
  sessionAttendance: Array<{
    session: { scheduledFor: Date };
  }>;
};

export function calculateEnrollmentCharges(
  enrollment: EnrollmentForPricing,
  throughDate = new Date(),
): Prisma.Decimal {
  const basePrice =
    enrollment.customPriceOverride ?? enrollment.priceAtEnrollment;

  if (enrollment.package.type === "PER_SESSION") {
    const billableAttendances = enrollment.sessionAttendance
      .filter(
        (attendance) =>
          attendance.session.scheduledFor <= throughDate &&
          attendance.session.scheduledFor >= enrollment.startDate,
      )
      .sort(
        (a, b) =>
          a.session.scheduledFor.getTime() -
          b.session.scheduledFor.getTime(),
      );

    return billableAttendances.reduce(
      (total, attendance, index) =>
        total.add(
          applyDiscounts(basePrice, enrollment.discounts, {
            date: attendance.session.scheduledFor,
            sessionNumber: index + 1,
          }),
        ),
      new Prisma.Decimal(0),
    );
  }

  const effectiveEnd =
    enrollment.endDate && enrollment.endDate < throughDate
      ? enrollment.endDate
      : throughDate;
  if (enrollment.startDate > effectiveEnd) return new Prisma.Decimal(0);

  const periodMonths = billingPeriodMonths(enrollment.package.billingPeriod);
  const firstPeriod = startOfBillingMonth(enrollment.startDate);
  const lastPeriod = startOfBillingMonth(effectiveEnd);
  const periodCount =
    Math.floor(
      billingMonthDifference(lastPeriod, firstPeriod) / periodMonths,
    ) + 1;

  let total = new Prisma.Decimal(0);
  for (let periodIndex = 0; periodIndex < periodCount; periodIndex++) {
    const periodDate = addBillingMonths(
      firstPeriod,
      periodIndex * periodMonths,
    );
    total = total.add(
      applyDiscounts(basePrice, enrollment.discounts, {
        date: periodDate,
        billingPeriodIndex: periodIndex,
      }),
    );
  }
  return total;
}
