import "server-only";

import { prisma } from "@/lib/prisma";
import { PersonStatus, Prisma } from "../../generated/prisma";

export type TutorFilters = {
  search?: string;
  status?: PersonStatus;
  subjectId?: string;
  page?: number;
  pageSize?: number;
};

function tutorSearchWhere(search: string): Prisma.TutorWhereInput {
  const tokens = search.trim().split(/\s+/).filter(Boolean).slice(0, 10);
  return {
    AND: tokens.map((token) => ({
      OR: [
        { firstName: { contains: token, mode: "insensitive" } },
        { lastName: { contains: token, mode: "insensitive" } },
        { email: { contains: token, mode: "insensitive" } },
        { phone: { contains: token, mode: "insensitive" } },
      ],
    })),
  };
}

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
    ...(search && tutorSearchWhere(search)),
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

export async function getTutorForAssistant(id: string, limit = 20) {
  return prisma.tutor.findUnique({
    where: { id },
    select: {
      id: true,
      firstName: true,
      lastName: true,
      avatarUrl: true,
      email: true,
      phone: true,
      hourlyRate: true,
      notes: true,
      status: true,
      createdAt: true,
      updatedAt: true,
      subjects: {
        select: { subject: { select: { id: true, name: true } } },
        orderBy: { subject: { name: "asc" } },
        take: limit,
      },
      _count: {
        select: {
          subjects: true,
          enrollments: { where: { status: "ACTIVE" } },
        },
      },
      enrollments: {
        where: { status: "ACTIVE" },
        select: {
          id: true,
          status: true,
          startDate: true,
          endDate: true,
          student: {
            select: { id: true, firstName: true, lastName: true },
          },
          subject: { select: { id: true, name: true } },
          package: { select: { id: true, name: true } },
        },
        orderBy: { createdAt: "desc" },
        take: limit,
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
  },
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
  toExclusive: Date,
) {
  return prisma.session.findMany({
    where: {
      tutorId,
      status: "COMPLETED",
      scheduledFor: { gte: from, lt: toExclusive },
    },
    include: { subject: true, enrollment: { include: { student: true } } },
    orderBy: { scheduledFor: "asc" },
  });
}

export async function getTutorPayrollForAssistantData(
  tutorId: string,
  from: Date,
  toExclusive: Date,
  limit: number,
) {
  const where = {
    tutorId,
    status: "COMPLETED" as const,
    scheduledFor: { gte: from, lt: toExclusive },
  };
  const [tutor, aggregate, total, sessions] = await Promise.all([
    prisma.tutor.findUnique({
      where: { id: tutorId },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        hourlyRate: true,
      },
    }),
    prisma.session.aggregate({
      where,
      _sum: { durationMinutes: true },
    }),
    prisma.session.count({ where }),
    prisma.session.findMany({
      where,
      select: {
        id: true,
        scheduledFor: true,
        durationMinutes: true,
        subject: { select: { id: true, name: true } },
        enrollment: {
          select: {
            student: {
              select: { id: true, firstName: true, lastName: true },
            },
          },
        },
      },
      orderBy: { scheduledFor: "desc" },
      take: limit,
    }),
  ]);
  return { tutor, totalMinutes: aggregate._sum.durationMinutes ?? 0, total, sessions };
}
