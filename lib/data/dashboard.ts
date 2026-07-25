import "server-only";

import { prisma } from "@/lib/prisma";
import {
  startOfDay,
  endOfDay,
  addDays,
  startOfWeek,
  endOfWeek,
  startOfMonth,
  endOfMonth,
  subMonths,
  format,
} from "date-fns";

export async function getSessionsForDay(date: Date) {
  return prisma.session.findMany({
    where: {
      scheduledFor: {
        gte: startOfDay(date),
        lte: endOfDay(date),
      },
      status: { in: ["SCHEDULED", "COMPLETED"] },
    },
    include: {
      tutor: { select: { firstName: true, lastName: true } },
      subject: { select: { name: true } },
      attendance: {
        include: { student: { select: { firstName: true, lastName: true } } },
      },
    },
    orderBy: { scheduledFor: "asc" },
  });
}

export async function getActiveStudentCount() {
  return prisma.student.count({ where: { status: "ACTIVE" } });
}

export async function getUpcomingPackageEndings(withinDays = 14) {
  const cutoff = addDays(new Date(), withinDays);
  return prisma.enrollment.findMany({
    where: {
      status: "ACTIVE",
      endDate: {
        gte: new Date(),
        lte: cutoff,
      },
    },
    include: {
      student: { select: { firstName: true, lastName: true } },
      package: { select: { name: true } },
      subject: { select: { name: true } },
    },
    orderBy: { endDate: "asc" },
  });
}

export async function getTutorSessionCountsThisWeek() {
  const now = new Date();
  const weekStart = startOfWeek(now, { weekStartsOn: 1 }); // Monday
  const weekEnd = endOfWeek(now, { weekStartsOn: 1 });

  const sessions = await prisma.session.findMany({
    where: {
      scheduledFor: { gte: weekStart, lte: weekEnd },
      status: { in: ["SCHEDULED", "COMPLETED"] },
    },
    include: {
      tutor: { select: { firstName: true, lastName: true } },
    },
  });

  const counts = new Map<string, { name: string; count: number }>();
  for (const s of sessions) {
    const key = s.tutorId;
    const existing = counts.get(key);
    if (existing) {
      existing.count++;
    } else {
      counts.set(key, {
        name: `${s.tutor.firstName} ${s.tutor.lastName}`,
        count: 1,
      });
    }
  }

  return Array.from(counts.values()).sort((a, b) => b.count - a.count);
}

export async function getStudentsWithBalance() {
  // Returns students + their payments and enrollment data for balance calculation
  return prisma.student.findMany({
    where: { status: "ACTIVE" },
    include: {
      payments: { select: { amount: true } },
      enrollments: {
        include: {
          package: { select: { type: true, billingPeriod: true } },
          sessionAttendance: {
            where: { billable: true },
            select: { session: { select: { scheduledFor: true } } },
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
          },
        },
      },
    },
  });
}

export async function getWeeklySessionsByDay() {
  const now = new Date();
  const weekStart = startOfWeek(now, { weekStartsOn: 1 });
  const weekEnd = endOfWeek(now, { weekStartsOn: 1 });

  const sessions = await prisma.session.findMany({
    where: {
      scheduledFor: { gte: weekStart, lte: weekEnd },
      status: { in: ["SCHEDULED", "COMPLETED"] },
    },
    select: { scheduledFor: true },
  });

  const days = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
  const counts = Object.fromEntries(days.map((d) => [d, 0]));
  for (const s of sessions) {
    const dayKey = format(s.scheduledFor, "EEE");
    if (dayKey in counts) counts[dayKey]++;
  }
  return days.map((day) => ({ day, sessions: counts[day] }));
}

export async function getMonthlyRevenue(months = 6) {
  const now = new Date();
  return Promise.all(
    Array.from({ length: months }, (_, i) => {
      const date = subMonths(now, months - 1 - i);
      const start = startOfMonth(date);
      const end = endOfMonth(date);
      return prisma.payment
        .aggregate({ where: { paidAt: { gte: start, lte: end } }, _sum: { amount: true } })
        .then((r) => ({ month: format(date, "MMM"), revenue: Number(r._sum.amount ?? 0) }));
    })
  );
}
