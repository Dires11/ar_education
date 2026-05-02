import { Prisma } from "../../generated/prisma";
import { prisma } from "@/lib/prisma";

type DiscountRow = {
  kind: "PERCENT_OFF" | "FIXED_OFF" | "FREE_SESSIONS" | "FREE_MONTH" | "REDUCED_RATE";
  value: Prisma.Decimal;
  temporary: boolean;
  validFrom: Date | null;
  validUntil: Date | null;
  usesRemaining: number | null;
};

function billingPeriodMonths(period: "MONTHLY" | "THREE_MONTHS" | "YEARLY") {
  if (period === "YEARLY") return 12;
  if (period === "THREE_MONTHS") return 3;
  return 1;
}

/**
 * Compute the effective price for an enrollment session or month
 * given the base price and active discounts.
 */
export function applyDiscounts(
  basePrice: Prisma.Decimal,
  discounts: DiscountRow[],
  context: { date?: Date; sessionNumber?: number } = {}
): Prisma.Decimal {
  const now = context.date ?? new Date();
  let price = basePrice;

  for (const discount of discounts) {
    // Check validity window for temporary discounts
    if (discount.temporary) {
      if (discount.validFrom && now < discount.validFrom) continue;
      if (discount.validUntil && now > discount.validUntil) continue;
      if (
        discount.usesRemaining !== null &&
        discount.usesRemaining !== undefined &&
        discount.usesRemaining <= 0
      )
        continue;
    }

    switch (discount.kind) {
      case "PERCENT_OFF":
        price = price.mul(
          new Prisma.Decimal(1).sub(discount.value.div(100))
        );
        break;
      case "FIXED_OFF":
        price = Prisma.Decimal.max(
          new Prisma.Decimal(0),
          price.sub(discount.value)
        );
        break;
      case "REDUCED_RATE":
        price = discount.value;
        break;
      case "FREE_SESSIONS":
      case "FREE_MONTH":
        // These are handled as session/month count adjustments, not price math
        price = new Prisma.Decimal(0);
        break;
    }
  }

  return price;
}

/**
 * Compute a student's outstanding balance:
 * Sum of all enrollment charges minus sum of all payments.
 */
export async function getStudentBalance(studentId: string): Promise<Prisma.Decimal> {
  const [enrollments, payments] = await Promise.all([
    prisma.enrollment.findMany({
      where: { studentId, status: { in: ["ACTIVE", "PAUSED"] } },
      include: {
        package: true,
        discounts: true,
        sessions: {
          where: { status: "COMPLETED" },
          include: { attendance: { where: { studentId, billable: true } } },
        },
      },
    }),
    prisma.payment.findMany({ where: { studentId } }),
  ]);

  let totalCharged = new Prisma.Decimal(0);

  for (const enrollment of enrollments) {
    const effectivePrice = applyDiscounts(
      enrollment.customPriceOverride ?? enrollment.package.basePrice,
      enrollment.discounts
    );

    if (enrollment.package.type === "PER_SESSION") {
      // Count billable session attendance records for this student
      const billableCount = enrollment.sessions.reduce(
        (sum, session) => sum + session.attendance.length,
        0
      );
      totalCharged = totalCharged.add(effectivePrice.mul(billableCount));
    } else {
      // Subscription packages charge once per billing period.
      const start = new Date(enrollment.startDate);
      const end = enrollment.endDate ? new Date(enrollment.endDate) : new Date();
      const months =
        (end.getFullYear() - start.getFullYear()) * 12 +
        (end.getMonth() - start.getMonth()) +
        1;
      const periods = Math.ceil(
        Math.max(1, months) / billingPeriodMonths(enrollment.package.billingPeriod)
      );
      totalCharged = totalCharged.add(effectivePrice.mul(periods));
    }
  }

  const totalPaid = payments.reduce(
    (sum, p) => sum.add(p.amount),
    new Prisma.Decimal(0)
  );

  return totalCharged.sub(totalPaid);
}
