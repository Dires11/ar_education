import { prisma } from "@/lib/prisma";
import { addDays, startOfDay, endOfDay, endOfMonth } from "date-fns";

export async function getSessionsByWeek(weekStart: Date) {
  const weekEnd = addDays(weekStart, 6);
  return prisma.session.findMany({
    where: {
      scheduledFor: {
        gte: startOfDay(weekStart),
        lte: endOfDay(weekEnd),
      },
    },
    include: {
      tutor: true,
      subject: true,
      attendance: { include: { student: true } },
      enrollment: { include: { student: true } },
    },
    orderBy: { scheduledFor: "asc" },
  });
}

export async function getSessionsByMonth(monthStart: Date) {
  const monthEnd = endOfMonth(monthStart);
  return prisma.session.findMany({
    where: {
      scheduledFor: {
        gte: startOfDay(monthStart),
        lte: endOfDay(monthEnd),
      },
    },
    include: {
      tutor: true,
      subject: true,
      attendance: { include: { student: true } },
      recurrenceRule: true,
      enrollment: { include: { package: true, student: true } },
    },
    orderBy: { scheduledFor: "asc" },
  });
}

export async function getSession(id: string) {
  return prisma.session.findUnique({
    where: { id },
    include: {
      tutor: true,
      subject: true,
      enrollment: { include: { student: true } },
      recurrenceRule: true,
      attendance: { include: { student: true } },
    },
  });
}

export async function getRecurrenceRuleById(id: string) {
  return prisma.recurrenceRule.findUnique({ where: { id } });
}

export async function getActiveRecurrenceRulesForEnrollment(enrollmentId: string) {
  const today = new Date();
  const rules = await prisma.recurrenceRule.findMany({
    where: {
      enrollmentId,
      OR: [{ endsOn: null }, { endsOn: { gte: today } }],
    },
    select: {
      id: true,
      dayOfWeek: true,
      startTime: true,
      durationMinutes: true,
      intervalWeeks: true,
      room: true,
      color: true,
      startsOn: true,
      endsOn: true,
      enrollment: { select: { subject: { select: { name: true } } } },
    },
    orderBy: { startsOn: "desc" }, // most recent first, so first seen per day is the active one
  });
  // Keep only the latest valid rule per dayOfWeek
  // Invalid = endsOn exists and is before startsOn (garbage from cascading splits)
  const seen = new Set<number>();
  return rules
    .filter((r) => {
      if (r.endsOn && r.endsOn < r.startsOn) return false; // invalid rule
      if (seen.has(r.dayOfWeek)) return false;
      seen.add(r.dayOfWeek);
      return true;
    })
    .sort((a, b) => a.dayOfWeek - b.dayOfWeek);
}

export async function getActiveRecurrenceRulesForGroup(groupId: string) {
  const today = new Date();
  return prisma.recurrenceRule.findMany({
    where: {
      groupId,
      startsOn: { lte: today },
      OR: [{ endsOn: null }, { endsOn: { gte: today } }],
    },
    include: {
      group: { include: { subject: true } },
    },
    orderBy: { dayOfWeek: "asc" },
  });
}

export async function createSession(data: {
  enrollmentId?: string;
  tutorId: string;
  subjectId: string;
  scheduledFor: Date;
  durationMinutes: number;
  room?: string;
  notes?: string;
  recurrenceRuleId?: string;
}) {
  return prisma.session.create({ data });
}

export async function createSessionAttendance(data: {
  sessionId: string;
  studentId: string;
  enrollmentId?: string;
}) {
  return prisma.sessionAttendance.createMany({ data: [data], skipDuplicates: true });
}

export async function createManySessionAttendances(
  data: Array<{ sessionId: string; studentId: string; enrollmentId: string }>
) {
  return prisma.sessionAttendance.createMany({ data, skipDuplicates: true });
}

export async function getRecurrenceRulesForMonth(monthStart: Date) {
  const monthEnd = endOfMonth(monthStart);
  const rules = await prisma.recurrenceRule.findMany({
    where: {
      startsOn: { lte: monthEnd },
      OR: [{ endsOn: null }, { endsOn: { gte: monthStart } }],
      enrollment: { status: { in: ["ACTIVE", "PAUSED"] } },
    },
    include: {
      enrollment: {
        include: { package: true, student: true, tutor: true, subject: true },
      },
    },
    orderBy: { startsOn: "asc" },
  });
  // Exclude invalid rules (endsOn before startsOn — garbage from cascading splits)
  return rules.filter((r) => !r.endsOn || r.endsOn >= r.startsOn);
}

export async function getGroupRecurrenceRulesForMonth(monthStart: Date) {
  const monthEnd = endOfMonth(monthStart);
  const rules = await prisma.recurrenceRule.findMany({
    where: {
      groupId: { not: null },
      startsOn: { lte: monthEnd },
      OR: [{ endsOn: null }, { endsOn: { gte: monthStart } }],
    },
    include: {
      group: {
        include: {
          tutor: true,
          subject: true,
          enrollments: {
            where: { status: { in: ["ACTIVE", "PAUSED"] } },
            include: { student: true },
          },
        },
      },
    },
    orderBy: { startsOn: "asc" },
  });
  return rules.filter((r) => !r.endsOn || r.endsOn >= r.startsOn);
}

export async function createRecurrenceRule(data: {
  enrollmentId?: string;
  groupId?: string;
  dayOfWeek: number;
  startTime: string;
  durationMinutes: number;
  intervalWeeks?: number;
  room?: string;
  color?: string;
  startsOn: Date;
  endsOn?: Date;
}) {
  return prisma.recurrenceRule.create({ data });
}

export async function updateSessionStatus(
  sessionId: string,
  status: "SCHEDULED" | "COMPLETED" | "NO_SHOW" | "CANCELLED_BY_TUTOR" | "CANCELLED_BY_STUDENT"
) {
  return prisma.$transaction([
    prisma.session.update({ where: { id: sessionId }, data: { status } }),
    prisma.sessionAttendance.updateMany({
      where: { sessionId },
      data: {
        status,
        billable: status === "COMPLETED",
      },
    }),
  ]);
}

export async function updateAttendance(
  sessionId: string,
  attendances: Array<{
    studentId: string;
    status: "SCHEDULED" | "COMPLETED" | "NO_SHOW" | "CANCELLED_BY_TUTOR" | "CANCELLED_BY_STUDENT";
    billable: boolean;
  }>
) {
  return prisma.$transaction(
    attendances.map((a) =>
      prisma.sessionAttendance.updateMany({
        where: { sessionId, studentId: a.studentId },
        data: { status: a.status, billable: a.billable },
      })
    )
  );
}

export async function cancelSession(
  id: string,
  cancelledBy: "TUTOR" | "STUDENT"
) {
  return prisma.session.update({
    where: { id },
    data: {
      status: cancelledBy === "TUTOR" ? "CANCELLED_BY_TUTOR" : "CANCELLED_BY_STUDENT",
    },
  });
}

export async function deleteSession(id: string) {
  return prisma.session.delete({ where: { id } });
}

export async function deleteFutureSessionsForRecurrenceRule(
  recurrenceRuleId: string,
  fromDate: Date
) {
  return prisma.session.deleteMany({
    where: {
      recurrenceRuleId,
      scheduledFor: { gte: startOfDay(fromDate) },
    },
  });
}

export async function deleteFutureGroupAttendanceForStudent(
  studentId: string,
  fromDate: Date
) {
  return prisma.sessionAttendance.deleteMany({
    where: {
      studentId,
      status: "SCHEDULED",
      session: {
        scheduledFor: { gte: startOfDay(fromDate) },
        enrollmentId: null,
      },
    },
  });
}

export async function detachSessionsFromRecurrenceRule(
  recurrenceRuleId: string
) {
  return prisma.session.updateMany({
    where: { recurrenceRuleId },
    data: { recurrenceRuleId: null },
  });
}

export async function updateSession(
  id: string,
  data: {
    scheduledFor?: Date;
    durationMinutes?: number;
    room?: string | null;
    notes?: string | null;
  }
) {
  return prisma.session.update({ where: { id }, data });
}

export async function closeRecurrenceRule(ruleId: string, endsOn: Date) {
  return prisma.recurrenceRule.update({
    where: { id: ruleId },
    data: { endsOn },
  });
}

export async function deleteRecurrenceRule(ruleId: string) {
  return prisma.recurrenceRule.delete({ where: { id: ruleId } });
}

export async function autoCompletePassedSessions() {
  const pastSessions = await prisma.session.findMany({
    where: { status: "SCHEDULED", scheduledFor: { lt: new Date() } },
    select: { id: true },
  });

  if (pastSessions.length === 0) return { count: 0 };

  const ids = pastSessions.map((s) => s.id);

  await prisma.sessionAttendance.updateMany({
    where: { sessionId: { in: ids }, status: "SCHEDULED" },
    data: { status: "COMPLETED", billable: true },
  });

  return prisma.session.updateMany({
    where: { id: { in: ids } },
    data: { status: "COMPLETED" },
  });
}

export async function getRecurringRulesInRange(
  from: Date,
  to: Date,
  options?: { recurrenceRuleIds?: string[] }
) {
  const rules = await prisma.recurrenceRule.findMany({
    where: {
      id: options?.recurrenceRuleIds?.length
        ? { in: options.recurrenceRuleIds }
        : undefined,
      startsOn: { lte: to },
      OR: [{ endsOn: null }, { endsOn: { gte: from } }],
      enrollment: { status: { in: ["ACTIVE", "PAUSED"] } },
    },
    include: {
      enrollment: {
        include: { tutor: true, subject: true, student: true, package: true },
      },
    },
    orderBy: { startsOn: "asc" },
  });
  // Exclude invalid rules (endsOn before startsOn — garbage from cascading splits)
  return rules.filter((r) => !r.endsOn || r.endsOn >= r.startsOn);
}

export async function getGroupRecurringRulesInRange(
  from: Date,
  to: Date,
  options?: { recurrenceRuleIds?: string[] }
) {
  const rules = await prisma.recurrenceRule.findMany({
    where: {
      groupId: { not: null },
      id: options?.recurrenceRuleIds?.length
        ? { in: options.recurrenceRuleIds }
        : undefined,
      startsOn: { lte: to },
      OR: [{ endsOn: null }, { endsOn: { gte: from } }],
    },
    include: {
      group: {
        include: {
          tutor: true,
          subject: true,
          enrollments: {
            where: { status: { in: ["ACTIVE", "PAUSED"] } },
            include: { student: true },
          },
        },
      },
    },
    orderBy: { startsOn: "asc" },
  });
  return rules.filter((r) => !r.endsOn || r.endsOn >= r.startsOn);
}

export async function getSessionsForRecurrenceRulesInRange(
  recurrenceRuleIds: string[],
  from: Date,
  to: Date
) {
  if (recurrenceRuleIds.length === 0) return [];

  return prisma.session.findMany({
    where: {
      recurrenceRuleId: { in: recurrenceRuleIds },
      scheduledFor: {
        gte: startOfDay(from),
        lte: endOfDay(to),
      },
    },
    select: {
      recurrenceRuleId: true,
      scheduledFor: true,
    },
  });
}

export async function getNonCancelledEnrollmentSessionsInRange(
  enrollmentIds: string[],
  from: Date,
  to: Date
) {
  if (enrollmentIds.length === 0) return [];

  return prisma.session.findMany({
    where: {
      enrollmentId: { in: enrollmentIds },
      status: { notIn: ["CANCELLED_BY_TUTOR", "CANCELLED_BY_STUDENT"] },
      scheduledFor: {
        gte: startOfDay(from),
        lte: endOfDay(to),
      },
    },
    select: {
      enrollmentId: true,
      scheduledFor: true,
    },
  });
}

export async function getSessionsInRange(from: Date, to: Date) {
  return prisma.session.findMany({
    where: {
      scheduledFor: {
        gte: startOfDay(from),
        lte: endOfDay(to),
      },
    },
    include: {
      tutor: true,
      subject: true,
      attendance: { include: { student: true } },
      enrollment: { include: { student: true } },
    },
    orderBy: { scheduledFor: "asc" },
  });
}

export async function createManySessions(
  data: Array<{
    enrollmentId?: string;
    tutorId: string;
    subjectId: string;
    scheduledFor: Date;
    durationMinutes: number;
    room?: string;
    notes?: string;
    recurrenceRuleId?: string;
  }>
) {
  return prisma.session.createMany({ data, skipDuplicates: true });
}

export async function updateRecurrenceRulesColorForEnrollment(
  enrollmentId: string,
  color: string
) {
  return prisma.recurrenceRule.updateMany({
    where: { enrollmentId },
    data: { color },
  });
}

export async function checkTutorConflict(
  tutorId: string,
  scheduledFor: Date,
  durationMinutes: number,
  excludeSessionId?: string
): Promise<boolean> {
  const endTime = new Date(
    scheduledFor.getTime() + durationMinutes * 60 * 1000
  );

  const conflict = await prisma.session.findFirst({
    where: {
      id: excludeSessionId ? { not: excludeSessionId } : undefined,
      tutorId,
      status: { in: ["SCHEDULED"] },
      scheduledFor: { lt: endTime },
      AND: [
        {
          scheduledFor: {
            gt: new Date(scheduledFor.getTime() - durationMinutes * 60 * 1000),
          },
        },
      ],
    },
  });

  return !!conflict;
}
