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

  const [students, matchingCount, rankedCount] = await Promise.all([
    prisma.student.findMany({
      where: rankedWhere,
      select: {
        id: true,
        firstName: true,
        lastName: true,
        dob: true,
        school: true,
        gradeLevel: true,
        status: true,
        createdAt: true,
        updatedAt: true,
      },
      orderBy,
      skip: (page - 1) * limit,
      take: limit,
    }),
    prisma.student.count({ where: matchingWhere }),
    prisma.student.count({ where: rankedWhere }),
  ]);

  return {
    students,
    matchingCount,
    rankedCount,
    missingDateOfBirthCount:
      sortBy === "DATE_OF_BIRTH" ? matchingCount - rankedCount : 0,
    page,
    limit,
    hasMore: page * limit < rankedCount,
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
