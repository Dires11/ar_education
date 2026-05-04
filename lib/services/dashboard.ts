import { addDays } from "date-fns";
import {
  getSessionsForDay,
  getActiveStudentCount,
  getUpcomingPackageEndings,
  getTutorSessionCountsThisWeek,
  getStudentsWithBalance,
  getWeeklySessionsByDay,
  getMonthlyRevenue,
} from "@/lib/data/dashboard";
import { applyDiscounts } from "@/lib/services/pricing";
import { Prisma } from "../../generated/prisma";

function billingPeriodMonths(period: "MONTHLY" | "THREE_MONTHS" | "YEARLY") {
  if (period === "YEARLY") return 12;
  if (period === "THREE_MONTHS") return 3;
  return 1;
}

export async function getDashboardStats() {
  const today = new Date();
  const tomorrow = addDays(today, 1);

  const [
    todaySessions,
    tomorrowSessions,
    activeStudentCount,
    upcomingEndings,
    tutorCounts,
    studentsData,
    weeklySessionsByDay,
    monthlyRevenue,
  ] = await Promise.all([
    getSessionsForDay(today),
    getSessionsForDay(tomorrow),
    getActiveStudentCount(),
    getUpcomingPackageEndings(14),
    getTutorSessionCountsThisWeek(),
    getStudentsWithBalance(),
    getWeeklySessionsByDay(),
    getMonthlyRevenue(6),
  ]);

  // Compute unpaid balances
  const unpaidStudents: { id: string; name: string; balance: string }[] = [];

  for (const student of studentsData) {
    let totalCharged = new Prisma.Decimal(0);

    for (const enrollment of student.enrollments) {
      const effectivePrice = applyDiscounts(
        enrollment.package.basePrice,
        enrollment.discounts
      );

      if (enrollment.package.type === "PER_SESSION") {
        const billableCount = enrollment.sessionAttendance.length;
        totalCharged = totalCharged.add(effectivePrice.mul(billableCount));
      } else {
        // Subscription packages charge once per billing period.
        const start = new Date(enrollment.startDate);
        const end = new Date();
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

    const totalPaid = student.payments.reduce(
      (sum, p) => sum.add(p.amount),
      new Prisma.Decimal(0)
    );

    const balance = totalCharged.sub(totalPaid);
    if (balance.greaterThan(0)) {
      unpaidStudents.push({
        id: student.id,
        name: `${student.firstName} ${student.lastName}`,
        balance: balance.toFixed(2),
      });
    }
  }

  unpaidStudents.sort(
    (a, b) => parseFloat(b.balance) - parseFloat(a.balance)
  );

  return {
    todaySessions,
    tomorrowSessions,
    activeStudentCount,
    upcomingEndings,
    tutorCounts,
    unpaidStudents,
    weeklySessionsByDay,
    monthlyRevenue,
  };
}
