import "server-only";

import {
  getSessionsForDay,
  getActiveStudentCount,
  getUpcomingPackageEndings,
  getUpcomingPackageEndingsForAssistant,
  getTutorSessionCountsThisWeek,
  getStudentsWithBalance,
  getStudentsWithBalanceForAssistant,
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

export async function getDashboardStats(options?: {
  materialize?: boolean;
  includeSessionDetails?: boolean;
  includeScheduleAggregates?: boolean;
  includeUnpaidStudents?: boolean;
  includeUpcomingEndings?: boolean;
}) {
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
  if (
    options?.includeSessionDetails !== false &&
    options?.materialize !== false
  ) {
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
  }

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
    options?.includeSessionDetails === false
      ? Promise.resolve([])
      : getSessionsForDay(todayStart, tomorrowStart),
    options?.includeSessionDetails === false
      ? Promise.resolve([])
      : getSessionsForDay(tomorrowStart, dayAfterTomorrowStart),
    getActiveStudentCount(),
    options?.includeUpcomingEndings === false
      ? Promise.resolve([])
      : getUpcomingPackageEndings(today, 14),
    options?.includeScheduleAggregates === false
      ? Promise.resolve([])
      : getTutorSessionCountsThisWeek(week.start, week.endExclusive),
    options?.includeUnpaidStudents === false
      ? Promise.resolve([])
      : getStudentsWithBalance(),
    options?.includeScheduleAggregates === false
      ? Promise.resolve([])
      : getWeeklySessionsByDay(week.start, week.endExclusive, timeZone),
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

export async function getDashboardReportPageForAssistant(input: {
  section: "UNPAID_STUDENTS" | "UPCOMING_ENDINGS";
  page: number;
  limit: number;
}) {
  const timeZone = getConfiguredCenterTimeZone();
  const today = getCalendarDateInTimeZone(new Date(), timeZone);
  if (input.section === "UPCOMING_ENDINGS") {
    const page = await getUpcomingPackageEndingsForAssistant({
      today,
      withinDays: 14,
      page: input.page,
      limit: input.limit,
    });
    return {
      ...page,
      results: page.results.map((enrollment) => ({
        id: enrollment.id,
        studentName: `${enrollment.student.firstName} ${enrollment.student.lastName}`,
        packageName: enrollment.package.name,
        subjectName: enrollment.subject.name,
        endDate: enrollment.endDate,
      })),
    };
  }

  const page = await getStudentsWithBalanceForAssistant({
    page: input.page,
    limit: input.limit,
  });
  const results: Array<{
    id: string;
    name: string;
    balance?: string;
    calculationComplete: boolean;
  }> = [];
  for (const student of page.students) {
    const calculationComplete =
      student.payments.length <= 500 &&
      student.enrollments.length <= 50 &&
      student.enrollments.every(
        (enrollment) =>
          enrollment.sessionAttendance.length <= 500 &&
          enrollment.discounts.length <= 100,
      );
    if (!calculationComplete) {
      results.push({
        id: student.id,
        name: `${student.firstName} ${student.lastName}`,
        calculationComplete: false,
      });
      continue;
    }
    let totalCharged = new Prisma.Decimal(0);
    for (const enrollment of student.enrollments) {
      totalCharged = totalCharged.add(calculateEnrollmentCharges(enrollment));
    }
    const totalPaid = student.payments.reduce(
      (sum, payment) => sum.add(payment.amount),
      new Prisma.Decimal(0),
    );
    const balance = totalCharged.sub(totalPaid);
    if (balance.greaterThan(0)) {
      results.push({
        id: student.id,
        name: `${student.firstName} ${student.lastName}`,
        balance: balance.toFixed(2),
        calculationComplete: true,
      });
    }
  }
  return {
    total: page.total,
    page: page.page,
    limit: page.limit,
    hasMore: page.hasMore,
    results,
    warnings: results.some((student) => !student.calculationComplete)
      ? [
          "Some high-volume student balances require the exact student balance tool.",
        ]
      : [],
  };
}
