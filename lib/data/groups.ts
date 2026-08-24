import "server-only";

import { prisma } from "@/lib/prisma";
import type { Prisma } from "@/generated/prisma";

export async function createGroup(data: {
  name: string;
  tutorId: string;
  subjectId: string;
}) {
  return prisma.group.create({ data });
}

export async function updateGroup(
  id: string,
  data: {
    name: string;
  }
) {
  return prisma.group.update({
    where: { id },
    data,
  });
}

export async function listGroups() {
  return prisma.group.findMany({
    include: {
      tutor: true,
      subject: true,
      enrollments: {
        where: { status: { in: ["ACTIVE", "PAUSED"] } },
        include: { student: true, package: true },
      },
    },
    orderBy: { name: "asc" },
  });
}

export async function listGroupsForAssistant(input: {
  groupId?: string;
  tutorId?: string;
  subjectId?: string;
  page: number;
  limit: number;
}) {
  const where = {
    ...(input.groupId ? { id: input.groupId } : {}),
    ...(input.tutorId ? { tutorId: input.tutorId } : {}),
    ...(input.subjectId ? { subjectId: input.subjectId } : {}),
  };
  const activeEnrollmentWhere = {
    status: { in: ["ACTIVE", "PAUSED"] },
  } satisfies Prisma.EnrollmentWhereInput;
  const [total, groups] = await prisma.$transaction([
    prisma.group.count({ where }),
    prisma.group.findMany({
      where,
      select: {
        id: true,
        name: true,
        tutor: { select: { id: true, firstName: true, lastName: true } },
        subject: { select: { id: true, name: true } },
        _count: {
          select: { enrollments: { where: activeEnrollmentWhere } },
        },
        enrollments: {
          where: activeEnrollmentWhere,
          select: {
            student: { select: { id: true, firstName: true, lastName: true } },
          },
          orderBy: [{ createdAt: "asc" }, { id: "asc" }],
          take: 20,
        },
      },
      orderBy: [{ name: "asc" }, { id: "asc" }],
      skip: (input.page - 1) * input.limit,
      take: input.limit,
    }),
  ]);
  return {
    total,
    page: input.page,
    limit: input.limit,
    hasMore: input.page * input.limit < total,
    groups: groups.map((group) => ({
      id: group.id,
      name: group.name,
      tutor: {
        id: group.tutor.id,
        name: `${group.tutor.firstName} ${group.tutor.lastName}`,
      },
      subject: group.subject,
      activeStudentCount: group._count.enrollments,
      students: group.enrollments.map(({ student }) => ({
        id: student.id,
        name: `${student.firstName} ${student.lastName}`,
      })),
    })),
  };
}

export async function listGroupsByTutorAndSubject(
  tutorId: string,
  subjectId: string
) {
  return prisma.group.findMany({
    where: { tutorId, subjectId },
    include: {
      enrollments: {
        where: { status: { in: ["ACTIVE", "PAUSED"] } },
        include: { student: true, package: true },
      },
    },
    orderBy: { name: "asc" },
  });
}

export async function getGroupWithMembers(groupId: string) {
  return prisma.group.findUnique({
    where: { id: groupId },
    include: {
      tutor: true,
      subject: true,
      enrollments: {
        where: { status: { in: ["ACTIVE", "PAUSED"] } },
        include: { student: true },
      },
    },
  });
}

export async function deleteGroupIfNoActiveMembers(groupId: string) {
  return prisma.$transaction(async (tx) => {
    const activeMembers = await tx.enrollment.count({
      where: {
        groupId,
        status: { in: ["ACTIVE", "PAUSED"] },
      },
    });

    if (activeMembers > 0) return null;

    const ruleIds = await tx.recurrenceRule.findMany({
      where: { groupId },
      select: { id: true },
    });

    if (ruleIds.length > 0) {
      await tx.session.deleteMany({
        where: {
          recurrenceRuleId: { in: ruleIds.map((rule) => rule.id) },
          status: "SCHEDULED",
          scheduledFor: { gte: new Date() },
        },
      });
      await tx.recurrenceRule.deleteMany({
        where: { id: { in: ruleIds.map((rule) => rule.id) } },
      });
    }

    return tx.group.delete({
      where: { id: groupId },
    });
  });
}
