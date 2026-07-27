import "server-only";

import { prisma } from "@/lib/prisma";
import { Prisma } from "../../generated/prisma";

export type PaymentFilters = {
  studentId?: string;
  enrollmentId?: string;
  method?: string;
  from?: Date;
  to?: Date;
  page?: number;
  pageSize?: number;
};

export async function listPayments({
  studentId,
  enrollmentId,
  method,
  from,
  to,
  page = 1,
  pageSize = 30,
}: PaymentFilters = {}) {
  const where = {
    ...(studentId && { studentId }),
    ...(enrollmentId && { enrollmentId }),
    ...(method && { method: method as "CASH" | "BANK_TRANSFER" | "CARD" | "OTHER" }),
    ...(from || to
      ? {
          paidAt: {
            ...(from && { gte: from }),
            ...(to && { lte: to }),
          },
        }
      : {}),
  };

  const [payments, total] = await Promise.all([
    prisma.payment.findMany({
      where,
      include: {
        student: true,
        recordedBy: true,
        enrollment: { include: { subject: true, package: true } },
      },
      orderBy: { paidAt: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.payment.count({ where }),
  ]);

  return { payments, total, page, pageSize };
}

export async function listPaymentsForAssistant(filters: PaymentFilters = {}) {
  const {
    studentId,
    enrollmentId,
    method,
    from,
    to,
    page = 1,
    pageSize = 20,
  } = filters;
  const where = {
    ...(studentId && { studentId }),
    ...(enrollmentId && { enrollmentId }),
    ...(method && {
      method: method as "CASH" | "BANK_TRANSFER" | "CARD" | "OTHER",
    }),
    ...(from || to
      ? {
          paidAt: {
            ...(from && { gte: from }),
            ...(to && { lte: to }),
          },
        }
      : {}),
  };
  const [payments, total] = await Promise.all([
    prisma.payment.findMany({
      where,
      select: {
        id: true,
        amount: true,
        method: true,
        paidAt: true,
        coversMonth: true,
        student: {
          select: { id: true, firstName: true, lastName: true },
        },
        enrollment: {
          select: {
            id: true,
            subject: { select: { name: true } },
            package: { select: { name: true } },
          },
        },
      },
      orderBy: { paidAt: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.payment.count({ where }),
  ]);
  return { payments, total, page, pageSize };
}

export async function getPaymentForAssistantConfirmation(id: string) {
  return prisma.payment.findUnique({
    where: { id },
    include: {
      student: {
        include: {
          guardians: {
            include: { guardian: true },
            orderBy: { isPrimary: "desc" },
          },
          enrollments: true,
        },
      },
    },
  });
}

export async function createPayment(data: {
  studentId: string;
  amount: string;
  method: "CASH" | "BANK_TRANSFER" | "CARD" | "OTHER";
  paidAt: Date;
  recordedById: string;
  enrollmentId?: string;
  coversMonth?: string;
  notes?: string;
}) {
  return prisma.payment.create({ data });
}

export function createOutstandingPaymentForPeriod(input: {
  studentId: string;
  method: "CASH" | "BANK_TRANSFER" | "CARD" | "OTHER";
  paidAt: Date;
  recordedById: string;
  enrollmentId: string;
  coversMonth: string;
  amountDue: Prisma.Decimal;
}) {
  return prisma.$transaction(
    async (tx) => {
      await tx.$queryRaw`
        SELECT "id"
        FROM "Enrollment"
        WHERE "id" = ${input.enrollmentId}
        FOR UPDATE
      `;
      const paid = await tx.payment.aggregate({
        where: {
          enrollmentId: input.enrollmentId,
          coversMonth: input.coversMonth,
        },
        _sum: { amount: true },
      });
      const outstanding = Prisma.Decimal.max(
        new Prisma.Decimal(0),
        input.amountDue.sub(paid._sum.amount ?? 0),
      );
      if (outstanding.isZero()) {
        throw new Error("This billing period is already paid");
      }
      return tx.payment.create({
        data: {
          studentId: input.studentId,
          amount: outstanding,
          method: input.method,
          paidAt: input.paidAt,
          recordedById: input.recordedById,
          enrollmentId: input.enrollmentId,
          coversMonth: input.coversMonth,
        },
      });
    },
    { isolationLevel: "Serializable" },
  );
}

export async function deletePayment(id: string) {
  return prisma.payment.delete({ where: { id } });
}

export async function getEnrollmentPaymentCoverage(
  enrollmentIds: string[],
  months: string[] // ["yyyy-MM", ...]
){
  if (enrollmentIds.length === 0) return [];
  if (months.length === 0) return [];

  const earliestMonth = months.reduce((min, month) =>
    month < min ? month : min
  );
  const [earliestYear, earliestMonthNumber] = earliestMonth
    .split("-")
    .map(Number);
  const coverageStarts = Array.from({ length: 12 }, (_, index) =>
    new Date(
      Date.UTC(earliestYear, earliestMonthNumber - 1 - index, 1),
    )
      .toISOString()
      .slice(0, 7),
  );

  return prisma.enrollment.findMany({
    where: {
      id: { in: enrollmentIds },
    },
    select: {
      id: true,
      startDate: true,
      endDate: true,
      status: true,
      updatedAt: true,
      priceAtEnrollment: true,
      customPriceOverride: true,
      package: {
        select: { type: true, billingPeriod: true },
      },
      discounts: true,
      payments: {
        where: {
          coversMonth: {
            in: [...new Set([...months, ...coverageStarts])],
          },
        },
        select: {
          coversMonth: true,
          amount: true,
        },
      },
    },
  });
}

export async function getPaymentStats(input: {
  thisMonthStart: Date;
  thisMonthEndExclusive: Date;
  lastMonthStart: Date;
  lastMonthEndExclusive: Date;
}) {
  const [thisMonth, lastMonth, total] = await Promise.all([
    prisma.payment.aggregate({
      where: {
        paidAt: {
          gte: input.thisMonthStart,
          lt: input.thisMonthEndExclusive,
        },
      },
      _sum: { amount: true },
      _count: true,
    }),
    prisma.payment.aggregate({
      where: {
        paidAt: {
          gte: input.lastMonthStart,
          lt: input.lastMonthEndExclusive,
        },
      },
      _sum: { amount: true },
    }),
    prisma.payment.count(),
  ]);

  return {
    thisMonthTotal: Number(thisMonth._sum.amount ?? 0),
    thisMonthCount: thisMonth._count,
    lastMonthTotal: Number(lastMonth._sum.amount ?? 0),
    total,
  };
}

export function getEnrollmentPaymentDue(id: string) {
  return prisma.enrollment.findUnique({
    where: { id },
    include: {
      package: true,
      discounts: true,
    },
  });
}

export function getActiveSubscriptionEnrollments() {
  return prisma.enrollment.findMany({
    where: { status: "ACTIVE", package: { type: "MONTHLY" } },
    include: {
      student: {
        include: {
          guardians: {
            where: { isPrimary: true },
            include: { guardian: true },
          },
        },
      },
      package: true,
      subject: true,
      discounts: true,
      payments: {
        where: { coversMonth: { not: null } },
        select: { coversMonth: true, amount: true },
      },
    },
  });
}

export function getEnrollmentForPaymentReminder(
  id: string,
  coversMonth: string,
) {
  return prisma.enrollment.findUnique({
    where: { id },
    include: {
      student: {
        include: {
          guardians: {
            where: { isPrimary: true },
            include: { guardian: true },
          },
        },
      },
      package: true,
      subject: true,
      tutor: true,
      discounts: true,
      payments: {
        where: { coversMonth },
        select: { amount: true },
      },
    },
  });
}
