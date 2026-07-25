import "server-only";

import { addDays, endOfDay, startOfDay } from "date-fns";
import {
  getSessionsForDay,
  getActiveStudentCount,
  getUpcomingPackageEndings,
  getTutorSessionCountsThisWeek,
  getStudentsWithBalance,
  getWeeklySessionsByDay,
  getMonthlyRevenue,
} from "@/lib/data/dashboard";
import { calculateEnrollmentCharges } from "@/lib/services/pricing-calculator";
import {
  materializeSessions,
  materializeGroupSessions,
} from "@/lib/services/session-materialization";
import { Prisma } from "../../generated/prisma";

export async function getDashboardStats() {
  const today = new Date();
  const tomorrow = addDays(today, 1);

  // Materialize today's + tomorrow's recurring sessions before querying,
  // so the dashboard is accurate even without a prior schedule-page visit.
  await Promise.all([
    materializeSessions(startOfDay(today), endOfDay(tomorrow)),
    materializeGroupSessions(startOfDay(today), endOfDay(tomorrow)),
  ]);

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
      totalCharged = totalCharged.add(
        calculateEnrollmentCharges(enrollment),
      );
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
