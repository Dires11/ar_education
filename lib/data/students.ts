import "server-only";

import { prisma } from "@/lib/prisma";
import { PersonStatus } from "../../generated/prisma";

export type StudentFilters = {
  search?: string;
  status?: PersonStatus;
  page?: number;
  pageSize?: number;
};

export async function listStudents({
  search,
  status,
  page = 1,
  pageSize = 20,
}: StudentFilters = {}) {
  const where = {
    ...(status && { status }),
    ...(search && {
      OR: [
        { firstName: { contains: search, mode: "insensitive" as const } },
        { lastName: { contains: search, mode: "insensitive" as const } },
        {
          guardians: {
            some: {
              guardian: {
                OR: [
                  {
                    firstName: {
                      contains: search,
                      mode: "insensitive" as const,
                    },
                  },
                  {
                    email: {
                      contains: search,
                      mode: "insensitive" as const,
                    },
                  },
                ],
              },
            },
          },
        },
      ],
    }),
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
