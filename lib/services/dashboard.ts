import "server-only";

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
import {
  addCalendarDays,
  addCalendarMonths,
  combineDateAndTime,
  getCalendarDateInTimeZone,
  getCalendarMonthKey,
  getCalendarMonthRange,
  getCalendarWeekRange,
  getConfiguredCenterTimeZone,
} from "@/lib/services/session-dates";

export async function getDashboardStats() {
  const now = new Date();
  const timeZone = getConfiguredCenterTimeZone();
  const today = getCalendarDateInTimeZone(now, timeZone);
  const tomorrow = addCalendarDays(today, 1);
  const dayAfterTomorrow = addCalendarDays(today, 2);
  const todayStart = combineDateAndTime(today, "00:00", timeZone);
  const tomorrowStart = combineDateAndTime(tomorrow, "00:00", timeZone);
  const dayAfterTomorrowStart = combineDateAndTime(
    dayAfterTomorrow,
    "00:00",
    timeZone,
  );
  const week = getCalendarWeekRange(now, timeZone);
  const currentMonth = getCalendarMonthRange(
    getCalendarMonthKey(now, timeZone),
    timeZone,
  );
  const revenueRanges = Array.from({ length: 6 }, (_, index) => {
    const calendarStart = addCalendarMonths(
      currentMonth.calendarStart,
      index - 5,
    );
    const range = getCalendarMonthRange(
      calendarStart.toISOString().slice(0, 7),
      timeZone,
    );
    return {
      month: new Intl.DateTimeFormat("en-US", {
        month: "short",
        timeZone: "UTC",
      }).format(calendarStart),
      start: range.start,
      endExclusive: range.endExclusive,
    };
  });

  // Materialize today's + tomorrow's recurring sessions before querying,
  // so the dashboard is accurate even without a prior schedule-page visit.
  await Promise.all([
    materializeSessions(
      todayStart,
      new Date(dayAfterTomorrowStart.getTime() - 1),
    ),
    materializeGroupSessions(
      todayStart,
      new Date(dayAfterTomorrowStart.getTime() - 1),
    ),
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
    getSessionsForDay(todayStart, tomorrowStart),
    getSessionsForDay(tomorrowStart, dayAfterTomorrowStart),
    getActiveStudentCount(),
    getUpcomingPackageEndings(today, 14),
    getTutorSessionCountsThisWeek(week.start, week.endExclusive),
    getStudentsWithBalance(),
    getWeeklySessionsByDay(week.start, week.endExclusive, timeZone),
    getMonthlyRevenue(revenueRanges),
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
