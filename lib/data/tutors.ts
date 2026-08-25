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

type TutorDirectoryFilters = Pick<
  TutorFilters,
  "search" | "status" | "subjectId"
>;

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

function tutorDirectoryWhere({
  search,
  status,
  subjectId,
}: TutorDirectoryFilters): Prisma.TutorWhereInput {
  return {
    ...(status && { status }),
    ...(subjectId && { subjects: { some: { subjectId } } }),
    ...(search && tutorSearchWhere(search)),
  };
}

export async function listTutors({
  search,
  status,
  subjectId,
  page = 1,
  pageSize = 20,
}: TutorFilters = {}) {
  const where = tutorDirectoryWhere({ search, status, subjectId });

  const [tutors, total] = await Promise.all([
    prisma.tutor.findMany({
      where,
      include: { subjects: { include: { subject: true } } },
      orderBy: [{ lastName: "asc" }, { firstName: "asc" }, { id: "asc" }],
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.tutor.count({ where }),
  ]);

  return { tutors, total, page, pageSize };
}

export async function getTutorDirectoryStats(
  filters: TutorDirectoryFilters = {},
) {
  const matchingWhere = tutorDirectoryWhere(filters);
  const [activeCount, coveredSubjects] = await Promise.all([
    prisma.tutor.count({
      where: { AND: [matchingWhere, { status: "ACTIVE" }] },
    }),
    prisma.tutorSubject.findMany({
      where: { tutor: matchingWhere },
      select: { subjectId: true },
      distinct: ["subjectId"],
    }),
  ]);

  return {
    activeCount,
    subjectsCoveredCount: coveredSubjects.length,
  };
}

const ASSISTANT_TUTOR_SEARCH_SUBJECT_LIMIT = 20;

export async function searchTutorsForAssistant(input: {
  query?: string;
  status?: PersonStatus;
  subjectId?: string;
  page: number;
  limit: number;
}) {
  const where = {
    ...(input.status && { status: input.status }),
    ...(input.subjectId && {
      subjects: { some: { subjectId: input.subjectId } },
    }),
    ...(input.query && tutorSearchWhere(input.query)),
  };
  const [tutors, total] = await Promise.all([
    prisma.tutor.findMany({
      where,
      select: {
        id: true,
        firstName: true,
        lastName: true,
        status: true,
        email: true,
        phone: true,
        hourlyRate: true,
        _count: { select: { subjects: true } },
        subjects: {
          where: input.subjectId ? { subjectId: input.subjectId } : undefined,
          select: {
            subject: { select: { id: true, name: true } },
          },
          orderBy: [
            { subject: { name: "asc" } },
            { subjectId: "asc" },
          ],
          take: ASSISTANT_TUTOR_SEARCH_SUBJECT_LIMIT,
        },
      },
      orderBy: [{ lastName: "asc" }, { firstName: "asc" }, { id: "asc" }],
      skip: (input.page - 1) * input.limit,
      take: input.limit,
    }),
    prisma.tutor.count({ where }),
  ]);
  return {
    tutors,
    total,
    page: input.page,
    limit: input.limit,
  };
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

export function getTutorProfileForAssistantMutation(id: string) {
  return prisma.tutor.findUnique({
    where: { id },
    select: {
      id: true,
      firstName: true,
      lastName: true,
      avatarUrl: true,
      avatarPublicId: true,
      email: true,
      phone: true,
      hourlyRate: true,
      notes: true,
    },
  });
}

export async function getTutorForAssistant(
  id: string,
  input: { page: number; limit: number } = { page: 1, limit: 20 },
) {
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
        orderBy: [
          { subject: { name: "asc" } },
          { subjectId: "asc" },
        ],
        skip: (input.page - 1) * input.limit,
        take: input.limit,
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
        orderBy: [{ createdAt: "desc" }, { id: "asc" }],
        skip: (input.page - 1) * input.limit,
        take: input.limit,
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
