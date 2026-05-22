import { prisma } from "@/lib/prisma";

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
