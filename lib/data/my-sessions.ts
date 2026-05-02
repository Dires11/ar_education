import { prisma } from "@/lib/prisma";
import {
  endOfMonth,
  startOfMonth,
} from "date-fns";

export async function getSessionsByMonth(startMonth: Date, endMonth?: Date) {
  return prisma.session.findMany({
    where: {
      scheduledFor: {
        gte: startOfMonth(startMonth),
        lte: endOfMonth(endMonth || startMonth),
      },
    },
    include: {
      tutor: true,
      subject: true,
      attendance: { include: { student: true } },
    },
    orderBy: { scheduledFor: "asc" },
  });
}

export async function getRecurringRulesByMonth(
  startMonth: Date,
  endMonth?: Date,
) {
  return prisma.recurrenceRule.findMany({
    where: {
      OR: [
        { startsOn: { lte: endOfMonth(endMonth ?? startMonth) }, endsOn: null },
        {
          startsOn: { lte: endOfMonth(endMonth ?? startMonth) },
          endsOn: { gte: startOfMonth(startMonth) },
        },
      ],
    },
  });
}
