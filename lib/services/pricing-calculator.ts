import { Prisma } from "../../generated/prisma";
import {
  addCalendarDays,
  combineDateAndTime,
  getCalendarDateInTimeZone,
  getConfiguredCenterTimeZone,
} from "@/lib/services/session-dates";

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
    calendarDate?: Date;
    sessionNumber?: number;
    billingPeriodIndex?: number;
    timeZone?: string;
  } = {},
): Prisma.Decimal {
  const timeZone = context.timeZone ?? getConfiguredCenterTimeZone();
  const chargeCalendarDate =
    context.calendarDate ??
    getCalendarDateInTimeZone(context.date ?? new Date(), timeZone);
  let price = basePrice;
  let isFree = false;

  for (const discount of discounts) {
    if (
      discount.validFrom &&
      chargeCalendarDate < startOfBillingMonthDay(discount.validFrom)
    ) {
      continue;
    }
    if (
      discount.validUntil &&
      chargeCalendarDate > startOfBillingMonthDay(discount.validUntil)
    ) {
      continue;
    }

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
          ? chargeCalendarDate.getUTCFullYear() ===
              discount.validFrom.getUTCFullYear() &&
            chargeCalendarDate.getUTCMonth() ===
              discount.validFrom.getUTCMonth()
          : context.billingPeriodIndex === 0;
        if (appliesToThisPeriod) isFree = true;
        break;
      }
    }
  }

  return isFree ? new Prisma.Decimal(0) : price;
}

function startOfBillingMonthDay(date: Date): Date {
  return new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()),
  );
}

export function calculateOutstandingAmount(
  amountDue: Prisma.Decimal,
  paymentAmounts: Prisma.Decimal[],
): Prisma.Decimal {
  const paidAmount = paymentAmounts.reduce(
    (total, paymentAmount) => total.add(paymentAmount),
    new Prisma.Decimal(0),
  );

  return Prisma.Decimal.max(
    new Prisma.Decimal(0),
    amountDue.sub(paidAmount),
  );
}

export type EnrollmentForPricing = {
  startDate: Date;
  endDate: Date | null;
  status: "ACTIVE" | "PAUSED" | "COMPLETED" | "CANCELLED";
  updatedAt: Date;
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

export type EnrollmentForPaymentCoverage = Pick<
  EnrollmentForPricing,
  | "startDate"
  | "endDate"
  | "status"
  | "updatedAt"
  | "priceAtEnrollment"
  | "customPriceOverride"
  | "discounts"
> & {
  package: {
    type: "MONTHLY" | "PER_SESSION";
    billingPeriod: "MONTHLY" | "THREE_MONTHS" | "YEARLY";
  };
  payments: Array<{
    coversMonth: string | null;
    amount: Prisma.Decimal;
  }>;
};

export function getBillingCutoff(
  enrollment: Pick<
    EnrollmentForPricing,
    "status" | "endDate" | "updatedAt"
  >,
  timeZone = getConfiguredCenterTimeZone(),
): Date | null {
  if (
    enrollment.status === "COMPLETED" ||
    enrollment.status === "CANCELLED"
  ) {
    // updatedAt is a defensive fallback for legacy rows created before
    // terminal enrollments were required to have an endDate.
    return (
      enrollment.endDate ??
      getCalendarDateInTimeZone(enrollment.updatedAt, timeZone)
    );
  }
  return enrollment.endDate;
}

export function getValidatedBillingPeriod(
  enrollment: Pick<
    EnrollmentForPricing,
    "startDate" | "endDate" | "status" | "updatedAt"
  > & {
    package: Pick<
      EnrollmentForPricing["package"],
      "type" | "billingPeriod"
    >;
  },
  month: string,
  timeZone = getConfiguredCenterTimeZone(),
) {
  if (enrollment.package.type !== "MONTHLY") {
    throw new Error("Only subscription enrollments have monthly dues");
  }

  const periodDate = new Date(`${month}-01T00:00:00.000Z`);
  const enrollmentStart = startOfBillingMonth(enrollment.startDate);
  if (periodDate < enrollmentStart) {
    throw new Error("That billing period is before the enrollment started");
  }

  const cutoff = getBillingCutoff(enrollment, timeZone);
  if (cutoff && periodDate > startOfBillingMonth(cutoff)) {
    throw new Error("That billing period is after the enrollment ended");
  }

  const periodMonths = billingPeriodMonths(
    enrollment.package.billingPeriod,
  );
  const monthsFromStart = billingMonthDifference(
    periodDate,
    enrollmentStart,
  );
  if (monthsFromStart % periodMonths !== 0) {
    throw new Error("That month is not a billing period for this enrollment");
  }

  return {
    periodDate,
    periodMonths,
    monthsFromStart,
    billingPeriodIndex: monthsFromStart / periodMonths,
  };
}

export function calculateEnrollmentCharges(
  enrollment: EnrollmentForPricing,
  throughDate = new Date(),
  timeZone = getConfiguredCenterTimeZone(),
): Prisma.Decimal {
  const basePrice =
    enrollment.customPriceOverride ?? enrollment.priceAtEnrollment;
  const billingCutoff = getBillingCutoff(enrollment, timeZone);

  if (enrollment.package.type === "PER_SESSION") {
    const enrollmentStart = combineDateAndTime(
      enrollment.startDate,
      "00:00",
      timeZone,
    );
    const cutoffEndExclusive = billingCutoff
      ? combineDateAndTime(
          addCalendarDays(billingCutoff, 1),
          "00:00",
          timeZone,
        )
      : null;
    const effectiveEnd =
      cutoffEndExclusive && cutoffEndExclusive <= throughDate
        ? new Date(cutoffEndExclusive.getTime() - 1)
        : throughDate;
    const billableAttendances = enrollment.sessionAttendance
      .filter(
        (attendance) =>
          attendance.session.scheduledFor <= effectiveEnd &&
          attendance.session.scheduledFor >= enrollmentStart,
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
            timeZone,
          }),
        ),
      new Prisma.Decimal(0),
    );
  }

  const throughCalendarDate = getCalendarDateInTimeZone(
    throughDate,
    timeZone,
  );
  const effectiveCalendarEnd =
    billingCutoff && billingCutoff < throughCalendarDate
      ? billingCutoff
      : throughCalendarDate;

  if (enrollment.startDate > effectiveCalendarEnd) {
    return new Prisma.Decimal(0);
  }

  const periodMonths = billingPeriodMonths(enrollment.package.billingPeriod);
  const firstPeriod = startOfBillingMonth(enrollment.startDate);
  const lastPeriod = startOfBillingMonth(effectiveCalendarEnd);
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
        calendarDate: periodDate,
        billingPeriodIndex: periodIndex,
        timeZone,
      }),
    );
  }
  return total;
}

export function getPaidBillingMonths(
  enrollment: EnrollmentForPaymentCoverage,
  wantedMonths: string[],
  timeZone = getConfiguredCenterTimeZone(),
): string[] {
  if (enrollment.package.type !== "MONTHLY") return [];

  const periodMonths = billingPeriodMonths(
    enrollment.package.billingPeriod,
  );
  const enrollmentStart = startOfBillingMonth(enrollment.startDate);
  const cutoff = getBillingCutoff(enrollment, timeZone);
  const finalBillingMonth = cutoff
    ? startOfBillingMonth(cutoff)
    : null;
  const paymentsByMonth = new Map<string, Prisma.Decimal>();

  for (const payment of enrollment.payments) {
    if (!payment.coversMonth) continue;
    paymentsByMonth.set(
      payment.coversMonth,
      (paymentsByMonth.get(payment.coversMonth) ?? new Prisma.Decimal(0))
        .add(payment.amount),
    );
  }

  const paidMonths: string[] = [];
  for (const wantedMonth of new Set(wantedMonths)) {
    const wantedMonthDate = new Date(
      `${wantedMonth}-01T00:00:00.000Z`,
    );
    const monthsFromStart = billingMonthDifference(
      wantedMonthDate,
      enrollmentStart,
    );
    if (monthsFromStart < 0) continue;
    if (finalBillingMonth && wantedMonthDate > finalBillingMonth) continue;

    const billingPeriodIndex = Math.floor(
      monthsFromStart / periodMonths,
    );
    const periodStart = addBillingMonths(
      enrollmentStart,
      billingPeriodIndex * periodMonths,
    );
    const periodKey = periodStart.toISOString().slice(0, 7);
    const total = paymentsByMonth.get(periodKey) ?? new Prisma.Decimal(0);
    const amountDue = applyDiscounts(
      enrollment.customPriceOverride ?? enrollment.priceAtEnrollment,
      enrollment.discounts,
      { calendarDate: periodStart, billingPeriodIndex, timeZone },
    );
    if (!total.lessThan(amountDue)) paidMonths.push(wantedMonth);
  }

  return paidMonths;
}
