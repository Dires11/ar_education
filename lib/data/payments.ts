import { prisma } from "@/lib/prisma";
import { addMonths, format, parse } from "date-fns";

export type PaymentFilters = {
  studentId?: string;
  enrollmentId?: string;
  from?: Date;
  to?: Date;
  page?: number;
  pageSize?: number;
};

export async function listPayments({
  studentId,
  enrollmentId,
  from,
  to,
  page = 1,
  pageSize = 30,
}: PaymentFilters = {}) {
  const where = {
    ...(studentId && { studentId }),
    ...(enrollmentId && { enrollmentId }),
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

export async function deletePayment(id: string) {
  return prisma.payment.delete({ where: { id } });
}

export async function getEnrollmentPaidMonths(
  enrollmentIds: string[],
  months: string[] // ["yyyy-MM", ...]
): Promise<Array<{ enrollmentId: string; coversMonth: string }>> {
  if (enrollmentIds.length === 0) return [];
  if (months.length === 0) return [];

  const earliestMonth = months.reduce((min, month) =>
    month < min ? month : min
  );
  const coverageStarts = Array.from({ length: 12 }, (_, index) =>
    format(addMonths(parse(`${earliestMonth}-01`, "yyyy-MM-dd", new Date()), -index), "yyyy-MM")
  );

  const rows = await prisma.payment.findMany({
    where: {
      enrollmentId: { in: enrollmentIds },
      coversMonth: { in: [...new Set([...months, ...coverageStarts])] },
    },
    select: {
      enrollmentId: true,
      coversMonth: true,
      enrollment: { select: { package: { select: { billingPeriod: true } } } },
    },
  });

  const wantedMonths = new Set(months);
  const paid: Array<{ enrollmentId: string; coversMonth: string }> = [];

  for (const row of rows) {
    if (!row.enrollmentId || !row.coversMonth) continue;

    const periodMonths =
      row.enrollment?.package.billingPeriod === "YEARLY"
        ? 12
        : row.enrollment?.package.billingPeriod === "THREE_MONTHS"
        ? 3
        : 1;
    const periodStart = parse(`${row.coversMonth}-01`, "yyyy-MM-dd", new Date());

    for (let offset = 0; offset < periodMonths; offset++) {
      const coveredMonth = format(addMonths(periodStart, offset), "yyyy-MM");
      if (wantedMonths.has(coveredMonth)) {
        paid.push({ enrollmentId: row.enrollmentId, coversMonth: coveredMonth });
      }
    }
  }

  return paid;
}
