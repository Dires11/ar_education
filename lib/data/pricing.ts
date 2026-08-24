import "server-only";

import { prisma } from "@/lib/prisma";

export const ASSISTANT_EXACT_BALANCE_QUERY_LIMITS = {
  payments: 100,
  enrollments: 10,
  attendancePerEnrollment: 100,
  discountsPerEnrollment: 20,
} as const;

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

export function getStudentBillingDataForAssistant(studentId: string) {
  // Every nested collection includes one sentinel row. The service refuses to
  // calculate when a sentinel is present, so an exact balance is never based
  // on silently truncated billing history.
  return prisma.student.findUnique({
    where: { id: studentId },
    select: {
      id: true,
      payments: {
        select: { amount: true },
        orderBy: { id: "asc" },
        take: ASSISTANT_EXACT_BALANCE_QUERY_LIMITS.payments + 1,
      },
      enrollments: {
        select: {
          id: true,
          status: true,
          startDate: true,
          endDate: true,
          updatedAt: true,
          priceAtEnrollment: true,
          customPriceOverride: true,
          package: { select: { type: true, billingPeriod: true } },
          sessionAttendance: {
            where: { studentId, billable: true },
            select: { session: { select: { scheduledFor: true } } },
            orderBy: { id: "asc" },
            take:
              ASSISTANT_EXACT_BALANCE_QUERY_LIMITS.attendancePerEnrollment + 1,
          },
          discounts: {
            select: {
              kind: true,
              value: true,
              temporary: true,
              validFrom: true,
              validUntil: true,
              usesRemaining: true,
            },
            orderBy: { id: "asc" },
            take:
              ASSISTANT_EXACT_BALANCE_QUERY_LIMITS.discountsPerEnrollment + 1,
          },
        },
        orderBy: { id: "asc" },
        take: ASSISTANT_EXACT_BALANCE_QUERY_LIMITS.enrollments + 1,
      },
    },
  });
}
