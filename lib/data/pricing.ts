import "server-only";

import { prisma } from "@/lib/prisma";

export async function getStudentBillingData(studentId: string) {
  return Promise.all([
    prisma.enrollment.findMany({
      where: { studentId },
      include: {
        package: {
          select: { type: true, billingPeriod: true },
        },
        discounts: true,
        sessionAttendance: {
          where: { studentId, billable: true },
          include: { session: { select: { scheduledFor: true } } },
        },
      },
    }),
    prisma.payment.findMany({ where: { studentId } }),
  ]);
}
