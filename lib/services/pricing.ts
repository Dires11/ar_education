import "server-only";

import { Prisma } from "../../generated/prisma";
import {
  ASSISTANT_EXACT_BALANCE_QUERY_LIMITS,
  getStudentBillingData,
  getStudentBillingDataForAssistant,
} from "@/lib/data/pricing";
import { calculateEnrollmentCharges } from "@/lib/services/pricing-calculator";

export async function getStudentBalance(
  studentId: string,
): Promise<Prisma.Decimal> {
  const [enrollments, payments] = await getStudentBillingData(studentId);
  const totalCharged = enrollments.reduce(
    (total, enrollment) =>
      total.add(calculateEnrollmentCharges(enrollment)),
    new Prisma.Decimal(0),
  );
  const totalPaid = payments.reduce(
    (total, payment) => total.add(payment.amount),
    new Prisma.Decimal(0),
  );
  return totalCharged.sub(totalPaid);
}

export async function getStudentBalanceForAssistant(studentId: string) {
  const student = await getStudentBillingDataForAssistant(studentId);
  if (!student) return null;

  const calculationComplete =
    student.payments.length <= ASSISTANT_EXACT_BALANCE_QUERY_LIMITS.payments &&
    student.enrollments.length <=
      ASSISTANT_EXACT_BALANCE_QUERY_LIMITS.enrollments &&
    student.enrollments.every(
      (enrollment) =>
        enrollment.sessionAttendance.length <=
          ASSISTANT_EXACT_BALANCE_QUERY_LIMITS.attendancePerEnrollment &&
        enrollment.discounts.length <=
          ASSISTANT_EXACT_BALANCE_QUERY_LIMITS.discountsPerEnrollment,
    );

  if (!calculationComplete) {
    return {
      calculationComplete: false as const,
      warnings: [
        "This student has more billing history than the assistant can safely calculate in one bounded request. Review the balance in the student record.",
      ],
    };
  }

  const totalCharged = student.enrollments.reduce(
    (total, enrollment) =>
      total.add(calculateEnrollmentCharges(enrollment)),
    new Prisma.Decimal(0),
  );
  const totalPaid = student.payments.reduce(
    (total, payment) => total.add(payment.amount),
    new Prisma.Decimal(0),
  );
  return {
    calculationComplete: true as const,
    balance: totalCharged.sub(totalPaid),
    warnings: [] as string[],
  };
}
