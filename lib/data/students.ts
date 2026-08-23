import "server-only";

import { prisma } from "@/lib/prisma";
import { PersonStatus, Prisma } from "../../generated/prisma";

export type StudentFilters = {
  search?: string;
  status?: PersonStatus;
  page?: number;
  pageSize?: number;
};

function studentSearchWhere(search: string): Prisma.StudentWhereInput {
  const tokens = search.trim().split(/\s+/).filter(Boolean).slice(0, 10);
  return {
    AND: tokens.map((token) => ({
      OR: [
        { firstName: { contains: token, mode: "insensitive" } },
        { lastName: { contains: token, mode: "insensitive" } },
        { email: { contains: token, mode: "insensitive" } },
        { phone: { contains: token, mode: "insensitive" } },
        { school: { contains: token, mode: "insensitive" } },
        { gradeLevel: { contains: token, mode: "insensitive" } },
        {
          guardians: {
            some: {
              guardian: {
                OR: [
                  { firstName: { contains: token, mode: "insensitive" } },
                  { lastName: { contains: token, mode: "insensitive" } },
                  { email: { contains: token, mode: "insensitive" } },
                  { phone: { contains: token, mode: "insensitive" } },
                ],
              },
            },
          },
        },
      ],
    })),
  };
}

export async function listStudents({
  search,
  status,
  page = 1,
  pageSize = 20,
}: StudentFilters = {}) {
  const where = {
    ...(status && { status }),
    ...(search && studentSearchWhere(search)),
  };

  const [students, total] = await Promise.all([
    prisma.student.findMany({
      where,
      include: {
        guardians: {
          include: { guardian: true },
          orderBy: { isPrimary: "desc" },
        },
      },
      orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.student.count({ where }),
  ]);

  return { students, total, page, pageSize };
}

export type StudentDirectoryDataQuery = {
  query?: string;
  status?: PersonStatus;
  school?: string;
  gradeLevel?: string;
  sortBy:
    | "DATE_OF_BIRTH"
    | "CREATED_AT"
    | "UPDATED_AT"
    | "LAST_NAME"
    | "FIRST_NAME";
  sortOrder: "ASC" | "DESC";
  page: number;
  limit: number;
};

export async function queryStudentDirectoryData({
  query,
  status,
  school,
  gradeLevel,
  sortBy,
  sortOrder,
  page,
  limit,
}: StudentDirectoryDataQuery) {
  const matchingWhere: Prisma.StudentWhereInput = {
    ...(status && { status }),
    ...(school && {
      school: { contains: school, mode: "insensitive" as const },
    }),
    ...(gradeLevel && {
      gradeLevel: { contains: gradeLevel, mode: "insensitive" as const },
    }),
    ...(query && studentSearchWhere(query)),
  };
  const rankedWhere: Prisma.StudentWhereInput =
    sortBy === "DATE_OF_BIRTH"
      ? { AND: [matchingWhere, { dob: { not: null } }] }
      : matchingWhere;
  const direction = sortOrder === "ASC" ? "asc" : "desc";
  const orderBy: Prisma.StudentOrderByWithRelationInput[] =
    sortBy === "DATE_OF_BIRTH"
      ? [{ dob: direction }, { lastName: "asc" }, { firstName: "asc" }]
      : sortBy === "CREATED_AT"
        ? [{ createdAt: direction }, { lastName: "asc" }, { firstName: "asc" }]
        : sortBy === "UPDATED_AT"
          ? [{ updatedAt: direction }, { lastName: "asc" }, { firstName: "asc" }]
          : sortBy === "FIRST_NAME"
            ? [{ firstName: direction }, { lastName: "asc" }]
            : [{ lastName: direction }, { firstName: "asc" }];

  const select = {
    id: true,
    firstName: true,
    lastName: true,
    dob: true,
    school: true,
    gradeLevel: true,
    status: true,
    createdAt: true,
    updatedAt: true,
  } satisfies Prisma.StudentSelect;

  const [initialStudents, matchingCount, rankedCount] = await Promise.all([
    prisma.student.findMany({
      where: rankedWhere,
      select,
      orderBy,
      skip: (page - 1) * limit,
      take: limit,
    }),
    prisma.student.count({ where: matchingWhere }),
    prisma.student.count({ where: rankedWhere }),
  ]);
  let students = initialStudents;

  let topRankTieCount = 0;
  let topRankTiesTruncated = false;
  if (
    sortBy === "DATE_OF_BIRTH" &&
    page === 1 &&
    limit === 1 &&
    students[0]?.dob
  ) {
    const tieWhere: Prisma.StudentWhereInput = {
      AND: [rankedWhere, { dob: students[0].dob }],
    };
    const tieLimit = 100;
    const [tieCount, tiedStudents] = await Promise.all([
      prisma.student.count({ where: tieWhere }),
      prisma.student.findMany({
        where: tieWhere,
        select,
        orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
        take: tieLimit,
      }),
    ]);
    topRankTieCount = tieCount;
    topRankTiesTruncated = tieCount > tiedStudents.length;
    students = tiedStudents;
  }

  return {
    students,
    matchingCount,
    rankedCount,
    missingDateOfBirthCount:
      sortBy === "DATE_OF_BIRTH" ? matchingCount - rankedCount : 0,
    page,
    limit,
    hasMore: page * limit < rankedCount,
    topRankTieCount,
    topRankTiesTruncated,
  };
}

export async function resolveStudentCommunicationRecipientsData(input: {
  studentIds?: string[];
  query?: string;
  status?: PersonStatus;
  school?: string;
  gradeLevel?: string;
  page: number;
  limit: number;
}) {
  const where: Prisma.StudentWhereInput = {
    ...(input.studentIds ? { id: { in: input.studentIds } } : {}),
    ...(input.status ? { status: input.status } : {}),
    ...(input.school
      ? { school: { contains: input.school, mode: "insensitive" as const } }
      : {}),
    ...(input.gradeLevel
      ? {
          gradeLevel: {
            contains: input.gradeLevel,
            mode: "insensitive" as const,
          },
        }
      : {}),
    ...(input.query ? studentSearchWhere(input.query) : {}),
  };
  const [total, students] = await prisma.$transaction([
    prisma.student.count({ where }),
    prisma.student.findMany({
      where,
      select: {
        id: true,
        firstName: true,
        lastName: true,
        status: true,
        email: true,
        guardians: {
          select: {
            guardian: {
              select: {
                firstName: true,
                lastName: true,
                email: true,
              },
            },
          },
          orderBy: { isPrimary: "desc" },
          take: 1,
        },
      },
      orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
      skip: (input.page - 1) * input.limit,
      take: input.limit,
    }),
  ]);
  return {
    total,
    page: input.page,
    limit: input.limit,
    hasMore: input.page * input.limit < total,
    recipients: students.map((student) => {
      const guardian = student.guardians[0]?.guardian;
      return {
        studentId: student.id,
        name: `${student.firstName} ${student.lastName}`,
        status: student.status,
        recipientName: guardian
          ? `${guardian.firstName} ${guardian.lastName}`
          : `${student.firstName} ${student.lastName}`,
        recipientEmail: guardian?.email ?? student.email,
        deliverable: Boolean(guardian?.email ?? student.email),
      };
    }),
  };
}

export async function getStudent(id: string) {
  return prisma.student.findUnique({
    where: { id },
    include: {
      guardians: {
        include: { guardian: true },
        orderBy: { isPrimary: "desc" },
      },
      enrollments: {
        include: { package: true, tutor: true, subject: true },
        orderBy: { createdAt: "desc" },
      },
    },
  });
}

export async function getStudentForAssistant(id: string, limit = 20) {
  const student = await prisma.student.findUnique({
    where: { id },
    select: {
      id: true,
      firstName: true,
      lastName: true,
      avatarUrl: true,
      dob: true,
      email: true,
      phone: true,
      school: true,
      gradeLevel: true,
      notes: true,
      status: true,
      createdAt: true,
      updatedAt: true,
      _count: { select: { guardians: true, enrollments: true } },
      guardians: {
        select: {
          guardianId: true,
          isPrimary: true,
          guardian: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              email: true,
              phone: true,
              relationship: true,
            },
          },
        },
        orderBy: { isPrimary: "desc" },
        take: limit,
      },
      enrollments: {
        select: {
          id: true,
          status: true,
          startDate: true,
          endDate: true,
          package: { select: { id: true, name: true } },
          tutor: {
            select: { id: true, firstName: true, lastName: true },
          },
          subject: { select: { id: true, name: true } },
        },
        orderBy: { createdAt: "desc" },
        take: limit,
      },
    },
  });
  if (!student) return null;
  const activeEnrollmentCount = await prisma.enrollment.count({
    where: { studentId: id, status: "ACTIVE" },
  });
  return { ...student, activeEnrollmentCount };
}

export async function createStudent(data: {
  firstName: string;
  lastName: string;
  avatarUrl?: string;
  avatarPublicId?: string;
  dob?: Date | null;
  email?: string;
  phone?: string;
  school?: string;
  gradeLevel?: string;
  notes?: string;
}) {
  return prisma.student.create({ data });
}

export async function createStudentWithGuardianData(
  studentData: Parameters<typeof createStudent>[0],
  guardianData?: {
    firstName: string;
    lastName: string;
    avatarUrl?: string;
    avatarPublicId?: string;
    email?: string;
    phone: string;
    relationship?: "PARENT" | "GUARDIAN" | "OTHER";
    notes?: string;
    isPrimary: boolean;
  },
) {
  return prisma.$transaction(async (tx) => {
    const student = await tx.student.create({ data: studentData });
    if (guardianData) {
      const { isPrimary, ...guardian } = guardianData;
      const createdGuardian = await tx.guardian.create({ data: guardian });
      await tx.studentGuardian.create({
        data: {
          studentId: student.id,
          guardianId: createdGuardian.id,
          isPrimary,
        },
      });
    }
    return student;
  });
}

export async function updateStudent(
  id: string,
  data: {
    firstName?: string;
    lastName?: string;
    avatarUrl?: string | null;
    avatarPublicId?: string | null;
    dob?: Date | null;
    email?: string;
    phone?: string;
    school?: string;
    gradeLevel?: string;
    notes?: string;
  }
) {
  return prisma.student.update({ where: { id }, data });
}

export async function updateStudentStatus(id: string, status: PersonStatus) {
  return prisma.student.update({
    where: { id },
    data: { status },
  });
}

export async function deleteStudent(id: string) {
  return prisma.student.delete({
    where: { id },
  });
}

export async function archiveStudent(id: string) {
  return prisma.student.update({
    where: { id },
    data: { status: "INACTIVE" },
  });
}

export async function createGuardian(data: {
  firstName: string;
  lastName: string;
  avatarUrl?: string;
  avatarPublicId?: string;
  email?: string;
  phone: string;
  relationship?: "PARENT" | "GUARDIAN" | "OTHER";
  notes?: string;
}) {
  return prisma.guardian.create({ data });
}

export async function linkGuardian(
  studentId: string,
  guardianId: string,
  isPrimary: boolean
) {
  return prisma.studentGuardian.create({
    data: { studentId, guardianId, isPrimary },
  });
}

export function createGuardianAndLink(
  studentId: string,
  guardianData: Parameters<typeof createGuardian>[0],
  isPrimary: boolean,
) {
  return prisma.$transaction(async (tx) => {
    const guardian = await tx.guardian.create({ data: guardianData });
    if (isPrimary) {
      await tx.studentGuardian.updateMany({
        where: { studentId },
        data: { isPrimary: false },
      });
    }
    await tx.studentGuardian.create({
      data: { studentId, guardianId: guardian.id, isPrimary },
    });
    return guardian;
  });
}

export async function updateGuardian(
  id: string,
  data: {
    firstName?: string;
    lastName?: string;
    avatarUrl?: string | null;
    avatarPublicId?: string | null;
    email?: string;
    phone?: string;
    relationship?: "PARENT" | "GUARDIAN" | "OTHER";
    notes?: string;
  }
) {
  return prisma.guardian.update({ where: { id }, data });
}

export async function getGuardian(id: string) {
  return prisma.guardian.findUnique({ where: { id } });
}

export function getLinkedGuardianForAssistant(
  studentId: string,
  guardianId: string,
) {
  return prisma.studentGuardian.findUnique({
    where: { studentId_guardianId: { studentId, guardianId } },
    select: {
      studentId: true,
      guardianId: true,
      isPrimary: true,
      guardian: {
        select: {
          id: true,
          firstName: true,
          lastName: true,
          email: true,
          phone: true,
          relationship: true,
        },
      },
      student: {
        select: { id: true, firstName: true, lastName: true },
      },
    },
  });
}

export function updateLinkedGuardian(input: {
  studentId: string;
  guardianId: string;
  data: {
    firstName?: string;
    lastName?: string;
    avatarUrl?: string | null;
    avatarPublicId?: string | null;
    email?: string;
    phone?: string;
    relationship?: "PARENT" | "GUARDIAN" | "OTHER";
    notes?: string;
  };
  isPrimary?: boolean;
}) {
  return prisma.$transaction(async (tx) => {
    const link = await tx.studentGuardian.findUnique({
      where: {
        studentId_guardianId: {
          studentId: input.studentId,
          guardianId: input.guardianId,
        },
      },
      include: { guardian: true },
    });
    if (!link) {
      throw new Error("Guardian is not linked to this student");
    }

    if (input.isPrimary === true) {
      await tx.studentGuardian.updateMany({
        where: {
          studentId: input.studentId,
          guardianId: { not: input.guardianId },
        },
        data: { isPrimary: false },
      });
    }

    const updated = await tx.guardian.update({
      where: { id: input.guardianId },
      data: input.data,
    });

    if (input.isPrimary !== undefined) {
      await tx.studentGuardian.update({
        where: {
          studentId_guardianId: {
            studentId: input.studentId,
            guardianId: input.guardianId,
          },
        },
        data: { isPrimary: input.isPrimary },
      });
    }

    return { existing: link.guardian, updated };
  });
}

export async function unlinkGuardian(studentId: string, guardianId: string) {
  return prisma.studentGuardian.delete({
    where: { studentId_guardianId: { studentId, guardianId } },
  });
}

export async function setGuardianPrimary(
  studentId: string,
  guardianId: string,
  isPrimary: boolean
) {
  return prisma.$transaction(async (tx) => {
    if (isPrimary) {
      await tx.studentGuardian.updateMany({
        where: { studentId, guardianId: { not: guardianId } },
        data: { isPrimary: false },
      });
    }
    return tx.studentGuardian.update({
      where: { studentId_guardianId: { studentId, guardianId } },
      data: { isPrimary },
    });
  });
}
