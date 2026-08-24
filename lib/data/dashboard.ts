import "server-only";

import { prisma } from "@/lib/prisma";
import { addDays } from "date-fns";
import { TZDate } from "@date-fns/tz";
import { format } from "date-fns";

export async function getSessionsForDay(
  start: Date,
  endExclusive: Date,
) {
  return prisma.session.findMany({
    where: {
      scheduledFor: {
        gte: start,
        lt: endExclusive,
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

export async function getUpcomingPackageEndings(
  today: Date,
  withinDays = 14,
) {
  const cutoff = addDays(today, withinDays);
  return prisma.enrollment.findMany({
    where: {
      status: "ACTIVE",
      endDate: {
        gte: today,
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

export async function getUpcomingPackageEndingsForAssistant(input: {
  today: Date;
  withinDays: number;
  page: number;
  limit: number;
}) {
  const cutoff = addDays(input.today, input.withinDays);
  const where = {
    status: "ACTIVE" as const,
    endDate: { gte: input.today, lte: cutoff },
  };
  const [total, results] = await prisma.$transaction([
    prisma.enrollment.count({ where }),
    prisma.enrollment.findMany({
      where,
      select: {
        id: true,
        endDate: true,
        student: { select: { firstName: true, lastName: true } },
        package: { select: { name: true } },
        subject: { select: { name: true } },
      },
      orderBy: [{ endDate: "asc" }, { id: "asc" }],
      skip: (input.page - 1) * input.limit,
      take: input.limit,
    }),
  ]);
  return {
    total,
    page: input.page,
    limit: input.limit,
    hasMore: input.page * input.limit < total,
    results,
  };
}

export async function getTutorSessionCountsThisWeek(
  weekStart: Date,
  weekEndExclusive: Date,
) {
  const sessions = await prisma.session.findMany({
    where: {
      scheduledFor: { gte: weekStart, lt: weekEndExclusive },
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

export const ASSISTANT_BALANCE_QUERY_LIMITS = {
  students: 10,
  paymentsPerStudent: 100,
  enrollmentsPerStudent: 10,
  attendancePerEnrollment: 100,
  discountsPerEnrollment: 20,
} as const;

export async function getStudentsWithBalanceForAssistant(input: {
  page: number;
  limit: number;
}) {
  // Include one sentinel child row at every level. That lets the service mark
  // a balance incomplete without ever materializing an unbounded relation.
  const limit = Math.min(input.limit, ASSISTANT_BALANCE_QUERY_LIMITS.students);
  const where = { status: "ACTIVE" as const };
  const [total, students] = await prisma.$transaction([
    prisma.student.count({ where }),
    prisma.student.findMany({
      where,
      select: {
        id: true,
        firstName: true,
        lastName: true,
        payments: {
          select: { amount: true },
          orderBy: { id: "asc" },
          take: ASSISTANT_BALANCE_QUERY_LIMITS.paymentsPerStudent + 1,
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
              where: { billable: true },
              select: { session: { select: { scheduledFor: true } } },
              orderBy: { id: "asc" },
              take: ASSISTANT_BALANCE_QUERY_LIMITS.attendancePerEnrollment + 1,
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
              take: ASSISTANT_BALANCE_QUERY_LIMITS.discountsPerEnrollment + 1,
            },
          },
          orderBy: { id: "asc" },
          take: ASSISTANT_BALANCE_QUERY_LIMITS.enrollmentsPerStudent + 1,
        },
      },
      orderBy: [{ firstName: "asc" }, { lastName: "asc" }, { id: "asc" }],
      skip: (input.page - 1) * limit,
      take: limit,
    }),
  ]);
  return {
    total,
    page: input.page,
    limit,
    hasMore: input.page * limit < total,
    students,
  };
}

export async function getWeeklySessionsByDay(
  weekStart: Date,
  weekEndExclusive: Date,
  timeZone: string,
) {
  const sessions = await prisma.session.findMany({
    where: {
      scheduledFor: { gte: weekStart, lt: weekEndExclusive },
      status: { in: ["SCHEDULED", "COMPLETED"] },
    },
    select: { scheduledFor: true },
  });

  const days = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
  const counts = Object.fromEntries(days.map((d) => [d, 0]));
  for (const s of sessions) {
    const dayKey = format(new TZDate(s.scheduledFor, timeZone), "EEE");
    if (dayKey in counts) counts[dayKey]++;
  }
  return days.map((day) => ({ day, sessions: counts[day] }));
}

export async function getMonthlyRevenue(
  ranges: Array<{
    month: string;
    start: Date;
    endExclusive: Date;
  }>,
) {
  return Promise.all(
    ranges.map(({ month, start, endExclusive }) => {
      return prisma.payment
        .aggregate({
          where: { paidAt: { gte: start, lt: endExclusive } },
          _sum: { amount: true },
        })
        .then((result) => ({
          month,
          revenue: Number(result._sum.amount ?? 0),
        }));
    }),
  );
}
