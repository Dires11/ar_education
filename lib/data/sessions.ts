import "server-only";

import { prisma } from "@/lib/prisma";
import { addDays, startOfDay, endOfDay } from "date-fns";
import { Prisma } from "../../generated/prisma";

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

export async function getSessionsByMonth(
  rangeStart: Date,
  rangeEndExclusive: Date,
) {
  return prisma.session.findMany({
    where: {
      scheduledFor: {
        gte: rangeStart,
        lt: rangeEndExclusive,
      },
    },
    include: {
      tutor: true,
      subject: true,
      attendance: { include: { student: true } },
      recurrenceRule: { include: { group: true } },
      enrollment: { include: { package: true, student: true } },
    },
    orderBy: { scheduledFor: "asc" },
  });
}

export async function getSessionsForAssistantMonth(
  rangeStart: Date,
  rangeEndExclusive: Date,
  limit: number,
) {
  const where = {
    scheduledFor: { gte: rangeStart, lt: rangeEndExclusive },
  };
  const [total, sessions, slots] = await prisma.$transaction([
    prisma.session.count({ where }),
    prisma.session.findMany({
      where,
      select: {
        id: true,
        enrollmentId: true,
        tutorId: true,
        subjectId: true,
        recurrenceRuleId: true,
        recurrenceOccurrenceFor: true,
        scheduledFor: true,
        durationMinutes: true,
        status: true,
        room: true,
        tutor: {
          select: { id: true, firstName: true, lastName: true },
        },
        subject: { select: { id: true, name: true } },
        _count: { select: { attendance: true } },
        attendance: {
          select: {
            status: true,
            billable: true,
            student: {
              select: { id: true, firstName: true, lastName: true },
            },
          },
          take: 20,
        },
      },
      orderBy: { scheduledFor: "asc" },
      take: limit,
    }),
    prisma.session.findMany({
      where,
      select: {
        enrollmentId: true,
        scheduledFor: true,
        status: true,
        recurrenceRuleId: true,
        recurrenceOccurrenceFor: true,
      },
      orderBy: { scheduledFor: "asc" },
    }),
  ]);
  return { total, hasMore: total > sessions.length, sessions, slots };
}

export function getAssistantSessionSlots(
  rangeStart: Date,
  rangeEndExclusive: Date,
) {
  return prisma.session.findMany({
    where: { scheduledFor: { gte: rangeStart, lt: rangeEndExclusive } },
    select: {
      enrollmentId: true,
      tutorId: true,
      scheduledFor: true,
      status: true,
      recurrenceRuleId: true,
      recurrenceOccurrenceFor: true,
      tutor: { select: { id: true, firstName: true, lastName: true } },
    },
    orderBy: { scheduledFor: "asc" },
  });
}

export async function getSessionsForAssistantRange(
  rangeStart: Date,
  rangeEndExclusive: Date,
  limit: number,
) {
  const where: Prisma.SessionWhereInput = {
    scheduledFor: { gte: rangeStart, lt: rangeEndExclusive },
    status: { in: ["SCHEDULED", "COMPLETED"] },
  };
  const [total, sessions] = await prisma.$transaction([
    prisma.session.count({ where }),
    prisma.session.findMany({
      where,
      select: {
        id: true,
        scheduledFor: true,
        durationMinutes: true,
        status: true,
        room: true,
        tutor: { select: { id: true, firstName: true, lastName: true } },
        subject: { select: { id: true, name: true } },
        _count: { select: { attendance: true } },
        attendance: {
          select: {
            student: {
              select: { id: true, firstName: true, lastName: true },
            },
          },
          take: 10,
        },
      },
      orderBy: { scheduledFor: "asc" },
      take: limit,
    }),
  ]);
  return { total, hasMore: total > sessions.length, sessions };
}

export async function getSessionForAssistant(id: string) {
  return prisma.session.findUnique({
    where: { id },
    select: {
      id: true,
      enrollmentId: true,
      tutorId: true,
      subjectId: true,
      recurrenceRuleId: true,
      recurrenceOccurrenceFor: true,
      scheduledFor: true,
      durationMinutes: true,
      status: true,
      room: true,
      tutor: { select: { id: true, firstName: true, lastName: true } },
      subject: { select: { id: true, name: true } },
      _count: { select: { attendance: true } },
      attendance: {
        select: {
          enrollmentId: true,
          status: true,
          billable: true,
          student: {
            select: { id: true, firstName: true, lastName: true },
          },
        },
        take: 100,
      },
    },
  });
}

export async function getSessionParticipantsForAssistant(input: {
  sessionId: string;
  studentId?: string;
  page: number;
  limit: number;
}) {
  const where = {
    sessionId: input.sessionId,
    ...(input.studentId ? { studentId: input.studentId } : {}),
  };
  const [session, total, participants] = await Promise.all([
    prisma.session.findUnique({
      where: { id: input.sessionId },
      select: { id: true },
    }),
    prisma.sessionAttendance.count({ where }),
    prisma.sessionAttendance.findMany({
      where,
      select: {
        studentId: true,
        enrollmentId: true,
        status: true,
        billable: true,
        student: {
          select: { id: true, firstName: true, lastName: true },
        },
      },
      orderBy: { studentId: "asc" },
      skip: (input.page - 1) * input.limit,
      take: input.limit,
    }),
  ]);
  if (!session) return null;
  return {
    sessionId: session.id,
    total,
    page: input.page,
    limit: input.limit,
    hasMore: input.page * input.limit < total,
    participants,
  };
}

export async function getSession(id: string) {
  return prisma.session.findUnique({
    where: { id },
    include: {
      tutor: true,
      subject: true,
      enrollment: { include: { student: true } },
      recurrenceRule: true,
      attendance: { include: { student: true, enrollment: true } },
    },
  });
}

export async function getRecurrenceRuleById(id: string) {
  return prisma.recurrenceRule.findUnique({ where: { id } });
}

export function getEnrollmentForSession(id: string) {
  return prisma.enrollment.findUnique({
    where: { id },
    include: { package: true, student: true },
  });
}

export async function getRecurrenceRuleWithParticipants(id: string) {
  return prisma.recurrenceRule.findUnique({
    where: { id },
    include: {
      enrollment: {
        include: {
          student: true,
          tutor: true,
          subject: true,
          package: true,
        },
      },
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
  });
}

export async function getRecurrenceRuleForAssistant(id: string) {
  return prisma.recurrenceRule.findUnique({
    where: { id },
    select: {
      id: true,
      enrollmentId: true,
      groupId: true,
      dayOfWeek: true,
      startTime: true,
      timeZone: true,
      durationMinutes: true,
      intervalWeeks: true,
      room: true,
      color: true,
      startsOn: true,
      endsOn: true,
      enrollment: {
        select: {
          id: true,
          status: true,
          student: {
            select: { id: true, firstName: true, lastName: true },
          },
          tutor: {
            select: { id: true, firstName: true, lastName: true },
          },
          subject: { select: { id: true, name: true } },
          package: { select: { id: true, name: true } },
        },
      },
      group: {
        select: {
          id: true,
          name: true,
          tutor: {
            select: { id: true, firstName: true, lastName: true },
          },
          subject: { select: { id: true, name: true } },
          _count: {
            select: {
              enrollments: {
                where: { status: { in: ["ACTIVE", "PAUSED"] } },
              },
            },
          },
          enrollments: {
            where: { status: { in: ["ACTIVE", "PAUSED"] } },
            select: {
              id: true,
              student: {
                select: { id: true, firstName: true, lastName: true },
              },
            },
            take: 50,
          },
        },
      },
    },
  });
}

export async function getActiveRecurrenceRulesForEnrollment(
  enrollmentId: string,
  calendarDate: Date,
) {
  const rules = await prisma.recurrenceRule.findMany({
    where: {
      enrollmentId,
      startsOn: { lte: calendarDate },
      OR: [{ endsOn: null }, { endsOn: { gte: calendarDate } }],
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

export async function getActiveRecurrenceRulesForGroup(
  groupId: string,
  calendarDate: Date,
) {
  return prisma.recurrenceRule.findMany({
    where: {
      groupId,
      startsOn: { lte: calendarDate },
      OR: [{ endsOn: null }, { endsOn: { gte: calendarDate } }],
    },
    include: {
      group: { include: { subject: true } },
    },
    orderBy: { dayOfWeek: "asc" },
  });
}

export async function listRecurrenceRulesForAssistant(input: {
  enrollmentId?: string;
  groupId?: string;
  includeEnded: boolean;
  calendarDate: Date;
  page: number;
  limit: number;
}) {
  const where = {
    ...(input.enrollmentId
      ? { enrollmentId: input.enrollmentId }
      : { groupId: input.groupId }),
    ...(input.includeEnded
      ? {}
      : { OR: [{ endsOn: null }, { endsOn: { gte: input.calendarDate } }] }),
  };
  const [total, rules] = await prisma.$transaction([
    prisma.recurrenceRule.count({ where }),
    prisma.recurrenceRule.findMany({
      where,
      select: {
      id: true,
      enrollmentId: true,
      groupId: true,
      dayOfWeek: true,
      startTime: true,
      timeZone: true,
      durationMinutes: true,
      intervalWeeks: true,
      room: true,
      color: true,
      startsOn: true,
      endsOn: true,
      enrollment: {
        select: {
          id: true,
          student: { select: { id: true, firstName: true, lastName: true } },
          tutor: { select: { id: true, firstName: true, lastName: true } },
          subject: { select: { id: true, name: true } },
        },
      },
      group: {
        select: {
          id: true,
          name: true,
          tutor: { select: { id: true, firstName: true, lastName: true } },
          subject: { select: { id: true, name: true } },
        },
      },
      },
      orderBy: [{ updatedAt: "desc" }, { dayOfWeek: "asc" }],
      skip: (input.page - 1) * input.limit,
      take: input.limit,
    }),
  ]);
  return {
    total,
    page: input.page,
    limit: input.limit,
    hasMore: input.page * input.limit < total,
    rules,
  };
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
  recurrenceOccurrenceFor?: Date;
  status?:
    | "SCHEDULED"
    | "COMPLETED"
    | "NO_SHOW"
    | "CANCELLED_BY_TUTOR"
    | "CANCELLED_BY_STUDENT";
}) {
  return prisma.session.create({ data });
}

export async function createSessionWithAttendances(
  sessionData: Parameters<typeof createSession>[0],
  attendances: Array<{
    studentId: string;
    enrollmentId?: string;
    status?:
      | "SCHEDULED"
      | "COMPLETED"
      | "NO_SHOW"
      | "CANCELLED_BY_TUTOR"
      | "CANCELLED_BY_STUDENT";
    billable?: boolean;
  }>,
) {
  return prisma.$transaction(async (tx) => {
    const session = await tx.session.create({ data: sessionData });
    if (attendances.length > 0) {
      await tx.sessionAttendance.createMany({
        data: attendances.map((attendance) => ({
          sessionId: session.id,
          ...attendance,
        })),
        skipDuplicates: true,
      });
    }
    return session;
  });
}

export async function createSessionAttendance(data: {
  sessionId: string;
  studentId: string;
  enrollmentId?: string;
}) {
  return prisma.sessionAttendance.createMany({
    data: [data],
    skipDuplicates: true,
  });
}

export async function createManySessionAttendances(
  data: Array<{ sessionId: string; studentId: string; enrollmentId: string }>,
) {
  return prisma.sessionAttendance.createMany({ data, skipDuplicates: true });
}

export async function getRecurrenceRulesForMonth(
  calendarMonthStart: Date,
  calendarMonthEnd: Date,
) {
  const rules = await prisma.recurrenceRule.findMany({
    where: {
      startsOn: { lte: calendarMonthEnd },
      OR: [{ endsOn: null }, { endsOn: { gte: calendarMonthStart } }],
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

export async function getGroupRecurrenceRulesForMonth(
  calendarMonthStart: Date,
  calendarMonthEnd: Date,
) {
  const rules = await prisma.recurrenceRule.findMany({
    where: {
      groupId: { not: null },
      startsOn: { lte: calendarMonthEnd },
      OR: [{ endsOn: null }, { endsOn: { gte: calendarMonthStart } }],
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

export type RecurrenceRuleCreateData = {
  enrollmentId?: string;
  groupId?: string;
  dayOfWeek: number;
  startTime: string;
  timeZone: string;
  durationMinutes: number;
  intervalWeeks?: number;
  room?: string;
  color?: string;
  startsOn: Date;
  endsOn?: Date;
};

export async function createRecurrenceRule(data: RecurrenceRuleCreateData) {
  return prisma.recurrenceRule.create({ data });
}

export async function createRecurrenceRules(rules: RecurrenceRuleCreateData[]) {
  return prisma.$transaction(
    rules.map((data) => prisma.recurrenceRule.create({ data })),
  );
}

export async function updateSessionStatus(
  sessionId: string,
  status:
    | "SCHEDULED"
    | "COMPLETED"
    | "NO_SHOW"
    | "CANCELLED_BY_TUTOR"
    | "CANCELLED_BY_STUDENT",
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

export function updateSessionStatusOnly(
  sessionId: string,
  status:
    | "SCHEDULED"
    | "COMPLETED"
    | "NO_SHOW"
    | "CANCELLED_BY_TUTOR"
    | "CANCELLED_BY_STUDENT",
) {
  return prisma.session.update({
    where: { id: sessionId },
    data: { status },
  });
}

export async function updateAttendance(
  sessionId: string,
  attendances: Array<{
    studentId: string;
    status:
      | "SCHEDULED"
      | "COMPLETED"
      | "NO_SHOW"
      | "CANCELLED_BY_TUTOR"
      | "CANCELLED_BY_STUDENT";
    billable: boolean;
  }>,
) {
  return prisma.$transaction(
    attendances.map((a) =>
      prisma.sessionAttendance.updateMany({
        where: { sessionId, studentId: a.studentId },
        data: { status: a.status, billable: a.billable },
      }),
    ),
  );
}

export function updateAttendanceAndSessionStatus(
  sessionId: string,
  attendances: Parameters<typeof updateAttendance>[1],
  sessionStatus:
    | "SCHEDULED"
    | "COMPLETED"
    | "NO_SHOW"
    | "CANCELLED_BY_TUTOR"
    | "CANCELLED_BY_STUDENT",
) {
  return prisma.$transaction([
    ...attendances.map((attendance) =>
      prisma.sessionAttendance.updateMany({
        where: { sessionId, studentId: attendance.studentId },
        data: {
          status: attendance.status,
          billable: attendance.billable,
        },
      }),
    ),
    prisma.session.update({
      where: { id: sessionId },
      data: { status: sessionStatus },
    }),
  ]);
}

export async function cancelSession(
  id: string,
  cancelledBy: "TUTOR" | "STUDENT",
) {
  return updateSessionStatus(
    id,
    cancelledBy === "TUTOR" ? "CANCELLED_BY_TUTOR" : "CANCELLED_BY_STUDENT",
  );
}

export async function deleteSession(id: string) {
  return prisma.session.delete({ where: { id } });
}

export async function deleteFutureSessionsForRecurrenceRule(
  recurrenceRuleId: string,
  fromDate: Date,
) {
  return prisma.session.deleteMany({
    where: {
      recurrenceRuleId,
      OR: [
        { recurrenceOccurrenceFor: { gte: fromDate } },
        {
          recurrenceOccurrenceFor: null,
          scheduledFor: { gte: fromDate },
        },
      ],
    },
  });
}

export async function deleteFutureGroupAttendanceForStudent(
  studentId: string,
  fromDate: Date,
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
  recurrenceRuleId: string,
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
  },
) {
  return prisma.session.update({ where: { id }, data });
}

export async function closeRecurrenceRule(ruleId: string, endsOn: Date) {
  return prisma.recurrenceRule.update({
    where: { id: ruleId },
    data: { endsOn },
  });
}

export function updateRecurrenceRule(
  ruleId: string,
  data: {
    startTime?: string;
    durationMinutes?: number;
    room?: string | null;
    intervalWeeks?: number;
    dayOfWeek?: number;
  },
) {
  return prisma.recurrenceRule.update({
    where: { id: ruleId },
    data,
  });
}

type RecurrenceRuleUpdateData = Parameters<typeof updateRecurrenceRule>[1];

function futureRecurrenceSessionsWhere(
  recurrenceRuleId: string,
  cutoff: Date,
): Prisma.SessionWhereInput {
  return {
    recurrenceRuleId,
    OR: [
      { recurrenceOccurrenceFor: { gte: cutoff } },
      {
        recurrenceOccurrenceFor: null,
        scheduledFor: { gte: cutoff },
      },
    ],
  };
}

export function splitRecurrenceRuleData(input: {
  ruleId: string;
  cutoff: Date;
  updateInPlace: boolean;
  update: RecurrenceRuleUpdateData;
  oldRuleEndsOn?: Date;
  newRule?: RecurrenceRuleCreateData;
}) {
  return prisma.$transaction(async (tx) => {
    await tx.session.deleteMany({
      where: futureRecurrenceSessionsWhere(input.ruleId, input.cutoff),
    });
    if (input.updateInPlace) {
      return tx.recurrenceRule.update({
        where: { id: input.ruleId },
        data: input.update,
      });
    }
    if (!input.oldRuleEndsOn || !input.newRule) {
      throw new Error("Split recurrence data is incomplete");
    }
    await tx.recurrenceRule.update({
      where: { id: input.ruleId },
      data: { endsOn: input.oldRuleEndsOn },
    });
    return tx.recurrenceRule.create({ data: input.newRule });
  });
}

export function endRecurrenceRuleData(input: {
  ruleId: string;
  cutoff: Date;
  endsOn: Date;
}) {
  return prisma.$transaction(async (tx) => {
    await tx.session.deleteMany({
      where: futureRecurrenceSessionsWhere(input.ruleId, input.cutoff),
    });
    return tx.recurrenceRule.update({
      where: { id: input.ruleId },
      data: { endsOn: input.endsOn },
    });
  });
}

export function deleteRecurringScheduleData(ruleId: string, cutoff: Date) {
  return prisma.$transaction(async (tx) => {
    await tx.session.deleteMany({
      where: futureRecurrenceSessionsWhere(ruleId, cutoff),
    });
    await tx.session.updateMany({
      where: { recurrenceRuleId: ruleId },
      data: { recurrenceRuleId: null },
    });
    return tx.recurrenceRule.delete({ where: { id: ruleId } });
  });
}

export async function deleteRecurrenceRule(ruleId: string) {
  return prisma.recurrenceRule.delete({ where: { id: ruleId } });
}

export async function getRecurringRulesInRange(
  from: Date,
  to: Date,
  options?: { recurrenceRuleIds?: string[] },
) {
  const rules = await prisma.recurrenceRule.findMany({
    where: {
      id: options?.recurrenceRuleIds?.length
        ? { in: options.recurrenceRuleIds }
        : undefined,
      // Date-only rule bounds are compared against an instant window. Pad the
      // coarse database filter, then let occurrence generation apply each
      // rule's own time zone precisely.
      startsOn: { lte: addDays(to, 1) },
      OR: [{ endsOn: null }, { endsOn: { gte: addDays(from, -1) } }],
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
  options?: { recurrenceRuleIds?: string[] },
) {
  const rules = await prisma.recurrenceRule.findMany({
    where: {
      groupId: { not: null },
      id: options?.recurrenceRuleIds?.length
        ? { in: options.recurrenceRuleIds }
        : undefined,
      startsOn: { lte: addDays(to, 1) },
      OR: [{ endsOn: null }, { endsOn: { gte: addDays(from, -1) } }],
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
  toExclusive: Date,
) {
  if (recurrenceRuleIds.length === 0) return [];

  return prisma.session.findMany({
    where: {
      recurrenceRuleId: { in: recurrenceRuleIds },
      OR: [
        {
          recurrenceOccurrenceFor: {
            gte: from,
            lt: toExclusive,
          },
        },
        {
          recurrenceOccurrenceFor: null,
          scheduledFor: {
            gte: from,
            lt: toExclusive,
          },
        },
      ],
    },
    select: {
      id: true,
      enrollmentId: true,
      recurrenceRuleId: true,
      recurrenceOccurrenceFor: true,
      scheduledFor: true,
    },
  });
}

export async function getNonCancelledEnrollmentSessionsInRange(
  enrollmentIds: string[],
  from: Date,
  toExclusive: Date,
) {
  if (enrollmentIds.length === 0) return [];

  return prisma.session.findMany({
    where: {
      enrollmentId: { in: enrollmentIds },
      status: { notIn: ["CANCELLED_BY_TUTOR", "CANCELLED_BY_STUDENT"] },
      scheduledFor: {
        gte: from,
        lt: toExclusive,
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
    recurrenceOccurrenceFor?: Date;
  }>,
) {
  return prisma.session.createMany({ data, skipDuplicates: true });
}

export async function updateRecurrenceRulesColorForEnrollment(
  enrollmentId: string,
  color: string,
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
  excludeSessionId?: string,
): Promise<boolean> {
  const endTime = new Date(
    scheduledFor.getTime() + durationMinutes * 60 * 1000,
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

export function getSessionsForConflictWindow(
  from: Date,
  toExclusive?: Date,
  excludeSessionId?: string,
  excludeRecurrenceRuleId?: string,
  conflictContext?: { tutorId: string; studentIds: string[] },
) {
  const relevanceFilters: Prisma.SessionWhereInput[] | undefined =
    conflictContext
      ? [
          { tutorId: conflictContext.tutorId },
          ...(conflictContext.studentIds.length > 0
            ? [
                {
                  attendance: {
                    some: {
                      studentId: { in: conflictContext.studentIds },
                    },
                  },
                },
                {
                  enrollment: {
                    studentId: { in: conflictContext.studentIds },
                  },
                },
              ]
            : []),
        ]
      : undefined;

  return prisma.session.findMany({
    where: {
      id: excludeSessionId ? { not: excludeSessionId } : undefined,
      OR: excludeRecurrenceRuleId
        ? [
            { recurrenceRuleId: null },
            { recurrenceRuleId: { not: excludeRecurrenceRuleId } },
          ]
        : undefined,
      status: { notIn: ["CANCELLED_BY_TUTOR", "CANCELLED_BY_STUDENT"] },
      scheduledFor: {
        gte: from,
        lt: toExclusive,
      },
      AND: relevanceFilters ? [{ OR: relevanceFilters }] : undefined,
    },
    include: {
      tutor: true,
      subject: true,
      attendance: { include: { student: true } },
      enrollment: { include: { student: true } },
    },
  });
}

export function getRecurringSchedulesForConflictWindow(
  from: Date,
  to?: Date,
  conflictContext?: { tutorId: string; studentIds: string[] },
) {
  const relevanceFilters: Prisma.RecurrenceRuleWhereInput[] | undefined =
    conflictContext
      ? [
          { enrollment: { tutorId: conflictContext.tutorId } },
          { group: { tutorId: conflictContext.tutorId } },
        ]
      : undefined;
  if (relevanceFilters && conflictContext?.studentIds.length) {
    relevanceFilters.push(
      {
        enrollment: {
          studentId: { in: conflictContext.studentIds },
        },
      },
      {
        group: {
          enrollments: {
            some: {
              studentId: { in: conflictContext.studentIds },
              status: { in: ["ACTIVE", "PAUSED"] },
            },
          },
        },
      },
    );
  }

  return prisma.recurrenceRule.findMany({
    where: {
      // These columns are date-only markers while from/to are instants.
      // Pad this coarse filter and validate exact occurrences in the service.
      startsOn: to ? { lte: addDays(to, 1) } : undefined,
      OR: [{ endsOn: null }, { endsOn: { gte: addDays(from, -1) } }],
      AND: relevanceFilters ? [{ OR: relevanceFilters }] : undefined,
    },
    include: {
      enrollment: {
        include: { student: true, tutor: true, subject: true },
      },
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
  });
}

export async function getEnrollmentWeekScheduleData(
  enrollmentId: string,
  weekStart: Date,
  weekEndExclusive: Date,
) {
  const [realCount, rules, realForDedup] = await Promise.all([
    prisma.session.count({
      where: {
        enrollmentId,
        status: { notIn: ["CANCELLED_BY_TUTOR", "CANCELLED_BY_STUDENT"] },
        scheduledFor: { gte: weekStart, lt: weekEndExclusive },
      },
    }),
    prisma.recurrenceRule.findMany({
      where: {
        enrollmentId,
        startsOn: { lte: addDays(weekEndExclusive, 1) },
        OR: [{ endsOn: null }, { endsOn: { gte: addDays(weekStart, -1) } }],
      },
    }),
    prisma.session.findMany({
      where: {
        enrollmentId,
        OR: [
          {
            recurrenceOccurrenceFor: {
              gte: weekStart,
              lt: weekEndExclusive,
            },
          },
          {
            recurrenceOccurrenceFor: null,
            scheduledFor: { gte: weekStart, lt: weekEndExclusive },
          },
        ],
      },
      select: {
        scheduledFor: true,
        recurrenceRuleId: true,
        recurrenceOccurrenceFor: true,
      },
    }),
  ]);
  return { realCount, rules, realForDedup };
}
