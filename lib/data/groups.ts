import { prisma } from "@/lib/prisma";

export async function createGroup(data: {
  name: string;
  tutorId: string;
  subjectId: string;
}) {
  return prisma.group.create({ data });
}

export async function listGroups() {
  return prisma.group.findMany({
    include: {
      tutor: true,
      subject: true,
      enrollments: { include: { student: true } },
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
    include: { enrollments: { include: { student: true } } },
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
