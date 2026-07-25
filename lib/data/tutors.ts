import "server-only";

import { prisma } from "@/lib/prisma";
import { PersonStatus } from "../../generated/prisma";

export type TutorFilters = {
  search?: string;
  status?: PersonStatus;
  subjectId?: string;
  page?: number;
  pageSize?: number;
};

export async function listTutors({
  search,
  status,
  subjectId,
  page = 1,
  pageSize = 20,
}: TutorFilters = {}) {
  const where = {
    ...(status && { status }),
    ...(subjectId && { subjects: { some: { subjectId } } }),
    ...(search && {
      OR: [
        { firstName: { contains: search, mode: "insensitive" as const } },
        { lastName: { contains: search, mode: "insensitive" as const } },
        { email: { contains: search, mode: "insensitive" as const } },
      ],
    }),
  };

  const [tutors, total] = await Promise.all([
    prisma.tutor.findMany({
      where,
      include: { subjects: { include: { subject: true } } },
      orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.tutor.count({ where }),
  ]);

  return { tutors, total, page, pageSize };
}

export async function getTutor(id: string) {
  return prisma.tutor.findUnique({
    where: { id },
    include: {
      subjects: { include: { subject: true } },
      enrollments: {
        include: { student: true, subject: true, package: true },
        where: { status: "ACTIVE" },
        orderBy: { createdAt: "desc" },
      },
    },
  });
}

export async function createTutor(data: {
  firstName: string;
  lastName: string;
  avatarUrl?: string;
  avatarPublicId?: string;
  email: string;
  phone: string;
  hourlyRate: string;
  notes?: string;
}) {
  return prisma.tutor.create({
    data: {
      firstName: data.firstName,
      lastName: data.lastName,
      avatarUrl: data.avatarUrl || null,
      avatarPublicId: data.avatarPublicId || null,
      email: data.email,
      phone: data.phone,
      hourlyRate: data.hourlyRate,
      notes: data.notes,
    },
  });
}

export async function createTutorWithSubjectsData(
  data: Parameters<typeof createTutor>[0],
  subjectIds: string[],
) {
  return prisma.$transaction(async (tx) => {
    const tutor = await tx.tutor.create({
      data: {
        firstName: data.firstName,
        lastName: data.lastName,
        avatarUrl: data.avatarUrl || null,
        avatarPublicId: data.avatarPublicId || null,
        email: data.email,
        phone: data.phone,
        hourlyRate: data.hourlyRate,
        notes: data.notes,
      },
    });
    await tx.tutorSubject.createMany({
      data: subjectIds.map((subjectId) => ({
        tutorId: tutor.id,
        subjectId,
      })),
    });
    return tutor;
  });
}

export async function updateTutor(
  id: string,
  data: {
    firstName?: string;
    lastName?: string;
    avatarUrl?: string;
    avatarPublicId?: string;
    email?: string;
    phone?: string;
    hourlyRate?: string;
    notes?: string;
  }
) {
  return prisma.tutor.update({
    where: { id },
    data: {
      ...data,
      avatarUrl: data.avatarUrl === "" ? null : data.avatarUrl,
      avatarPublicId: data.avatarPublicId === "" ? null : data.avatarPublicId,
    },
  });
}

export async function archiveTutor(id: string) {
  return prisma.tutor.update({
    where: { id },
    data: { status: "INACTIVE" },
  });
}

export async function setTutorSubjects(tutorId: string, subjectIds: string[]) {
  return prisma.$transaction(async (tx) => {
    await tx.tutorSubject.deleteMany({ where: { tutorId } });
    if (subjectIds.length > 0) {
      await tx.tutorSubject.createMany({
        data: subjectIds.map((subjectId) => ({ tutorId, subjectId })),
      });
    }
  });
}

export async function getTutorPayrollSessions(
  tutorId: string,
  from: Date,
  to: Date
) {
  return prisma.session.findMany({
    where: {
      tutorId,
      status: "COMPLETED",
      scheduledFor: { gte: from, lte: to },
    },
    include: { subject: true, enrollment: { include: { student: true } } },
    orderBy: { scheduledFor: "asc" },
  });
}
