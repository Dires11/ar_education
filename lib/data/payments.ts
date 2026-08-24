import "server-only";

import { prisma } from "@/lib/prisma";
import { Prisma } from "../../generated/prisma";

export type PaymentFilters = {
  paymentId?: string;
  studentId?: string;
  enrollmentId?: string;
  method?: string;
  from?: Date;
  to?: Date;
  page?: number;
  pageSize?: number;
};

export async function listPayments({
  paymentId,
  studentId,
  enrollmentId,
  method,
  from,
  to,
  page = 1,
  pageSize = 30,
}: PaymentFilters = {}) {
  const where = {
    ...(paymentId && { id: paymentId }),
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
      include: {
        student: true,
        recordedBy: true,
        enrollment: { include: { subject: true, package: true } },
      },
      orderBy: [{ paidAt: "desc" }, { id: "asc" }],
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.payment.count({ where }),
  ]);

  return {
    payments,
    total,
    page,
    pageSize,
    limit: pageSize,
    hasMore: page * pageSize < total,
  };
}

export async function listPaymentsForAssistant(filters: PaymentFilters = {}) {
  const {
    paymentId,
    studentId,
    enrollmentId,
    method,
    from,
    to,
    page = 1,
    pageSize = 20,
  } = filters;
  const where = {
    ...(paymentId && { id: paymentId }),
    ...(studentId && { studentId }),
    ...(enrollmentId && { enrollmentId }),
    ...(method && {
      method: method as "CASH" | "BANK_TRANSFER" | "CARD" | "OTHER",
    }),
    ...(from || to
      ? {
          paidAt: {
            ...(from && { gte: from }),
            ...(to && { lt: to }),
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
      orderBy: [{ paidAt: "desc" }, { id: "asc" }],
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.payment.count({ where }),
  ]);
  return {
    payments,
    total,
    page,
    pageSize,
    limit: pageSize,
    hasMore: page * pageSize < total,
  };
}

export async function getPaymentForAssistantConfirmation(id: string) {
  return prisma.payment.findUnique({
    where: { id },
    select: {
      id: true,
      amount: true,
      method: true,
      paidAt: true,
      coversMonth: true,
      student: {
        select: {
          id: true,
          firstName: true,
          lastName: true,
          avatarUrl: true,
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
  idempotencyKey?: string;
}) {
  if (data.idempotencyKey) {
    return prisma.payment.upsert({
      where: { idempotencyKey: data.idempotencyKey },
      update: {},
      create: data,
    });
  }
  return prisma.payment.create({ data });
}

export function createOutstandingPaymentForPeriod(input: {
  studentId: string;
  method: "CASH" | "BANK_TRANSFER" | "CARD" | "OTHER";
  paidAt: Date;
  recordedById: string;
  enrollmentId: string;
  coversMonth: string;
  expectedOutstandingAmount: string;
  calculateAmountDue: (
    enrollment: Prisma.EnrollmentGetPayload<{
      include: { package: true; discounts: true };
    }>,
  ) => Prisma.Decimal;
  idempotencyKey?: string;
}) {
  return prisma.$transaction(
    async (tx) => {
      await tx.$queryRaw`
        SELECT "id"
        FROM "Enrollment"
        WHERE "id" = ${input.enrollmentId}
        FOR UPDATE
      `;
      if (input.idempotencyKey) {
        const existing = await tx.payment.findUnique({
          where: { idempotencyKey: input.idempotencyKey },
        });
        if (existing) return existing;
      }
      // Lock every row that contributes to the calculated charge before
      // re-reading it. The enrollment lock also blocks new child discounts
      // while this payment is finalized through the foreign-key check.
      await tx.$queryRaw`
        SELECT "id"
        FROM "Package"
        WHERE "id" = (
          SELECT "packageId" FROM "Enrollment" WHERE "id" = ${input.enrollmentId}
        )
        FOR UPDATE
      `;
      await tx.$queryRaw`
        SELECT "id"
        FROM "Discount"
        WHERE "enrollmentId" = ${input.enrollmentId}
        ORDER BY "id"
        FOR UPDATE
      `;
      const enrollment = await tx.enrollment.findUnique({
        where: { id: input.enrollmentId },
        include: { package: true, discounts: true },
      });
      if (!enrollment || enrollment.studentId !== input.studentId) {
        throw new Error("Enrollment does not belong to this student");
      }
      const amountDue = input.calculateAmountDue(enrollment);
      const paid = await tx.payment.aggregate({
        where: {
          enrollmentId: input.enrollmentId,
          coversMonth: input.coversMonth,
        },
        _sum: { amount: true },
      });
      const outstanding = Prisma.Decimal.max(
        new Prisma.Decimal(0),
        amountDue.sub(paid._sum.amount ?? 0),
      );
      if (outstanding.isZero()) {
        throw new Error("This billing period is already paid");
      }
      const expectedOutstanding = new Prisma.Decimal(
        input.expectedOutstandingAmount,
      );
      if (!outstanding.equals(expectedOutstanding)) {
        throw new Error(
          `The outstanding amount changed from $${expectedOutstanding.toFixed(2)} to $${outstanding.toFixed(2)}. Review the updated amount and approve it again.`,
        );
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
          idempotencyKey: input.idempotencyKey,
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
  months: string[], // ["yyyy-MM", ...]
) {
  if (enrollmentIds.length === 0) return [];
  if (months.length === 0) return [];

  const earliestMonth = months.reduce((min, month) =>
    month < min ? month : min,
  );
  const [earliestYear, earliestMonthNumber] = earliestMonth
    .split("-")
    .map(Number);
  const coverageStarts = Array.from({ length: 12 }, (_, index) =>
    new Date(Date.UTC(earliestYear, earliestMonthNumber - 1 - index, 1))
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

export function getEnrollmentPaymentDueQuote(id: string, coversMonth: string) {
  return prisma.enrollment.findUnique({
    where: { id },
    include: {
      package: true,
      discounts: true,
      payments: {
        where: { coversMonth },
        select: { amount: true },
      },
    },
  });
}

export async function getActiveSubscriptionEnrollments(input: {
  page: number;
  limit: number;
  paymentFromMonth: string;
  paymentToMonth: string;
}) {
  const where = {
    status: "ACTIVE" as const,
    package: { type: "MONTHLY" as const },
  };
  const [total, enrollments, oldest] = await prisma.$transaction([
    prisma.enrollment.count({ where }),
    prisma.enrollment.findMany({
      where,
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
          where: {
            coversMonth: {
              gte: input.paymentFromMonth,
              lte: input.paymentToMonth,
            },
          },
          select: { coversMonth: true, amount: true },
        },
      },
      orderBy: { id: "asc" },
      skip: (input.page - 1) * input.limit,
      take: input.limit,
    }),
    prisma.enrollment.aggregate({
      where,
      _min: { startDate: true },
    }),
  ]);
  return {
    total,
    page: input.page,
    limit: input.limit,
    hasMore: input.page * input.limit < total,
    oldestApplicableStartDate: oldest._min.startDate,
    enrollments,
  };
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
