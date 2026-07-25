import "server-only";

import { Prisma } from "../../generated/prisma";
import { getStudentBillingData } from "@/lib/data/pricing";
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
