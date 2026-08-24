import "server-only";

import { prisma } from "@/lib/prisma";
import { EnrollmentStatus } from "../../generated/prisma";

export async function listEnrollments(filters?: {
  studentId?: string;
  tutorId?: string;
  groupId?: string;
  status?: EnrollmentStatus;
}) {
  return prisma.enrollment.findMany({
    where: {
      ...(filters?.studentId && { studentId: filters.studentId }),
      ...(filters?.tutorId && { tutorId: filters.tutorId }),
      ...(filters?.status && { status: filters.status }),
    },
    include: {
      student: true,
      package: true,
      tutor: true,
      subject: true,
      discounts: true,
      group: true,
    },
    orderBy: { createdAt: "desc" },
  });
}

export async function searchEnrollmentsForAssistant(filters: {
  studentId?: string;
  tutorId?: string;
  groupId?: string;
  status?: EnrollmentStatus;
  page: number;
  limit: number;
}) {
  const where = {
    ...(filters.studentId && { studentId: filters.studentId }),
    ...(filters.tutorId && { tutorId: filters.tutorId }),
    ...(filters.groupId && { groupId: filters.groupId }),
    ...(filters.status && { status: filters.status }),
  };
  const [enrollments, total] = await Promise.all([
    prisma.enrollment.findMany({
      where,
      select: {
        id: true,
        status: true,
        startDate: true,
        endDate: true,
        priceAtEnrollment: true,
        customPriceOverride: true,
        student: {
          select: { id: true, firstName: true, lastName: true },
        },
        tutor: {
          select: { id: true, firstName: true, lastName: true },
        },
        package: {
          select: { id: true, name: true, lessonType: true },
        },
        subject: { select: { id: true, name: true } },
        group: { select: { id: true, name: true } },
      },
      orderBy: [{ createdAt: "desc" }, { id: "asc" }],
      skip: (filters.page - 1) * filters.limit,
      take: filters.limit,
    }),
    prisma.enrollment.count({ where }),
  ]);
  return {
    enrollments,
    total,
    page: filters.page,
    limit: filters.limit,
    hasMore: filters.page * filters.limit < total,
  };
}

export async function getEnrollment(id: string) {
  return prisma.enrollment.findUnique({
    where: { id },
    include: {
      student: true,
      package: true,
      tutor: true,
      subject: true,
      discounts: true,
      group: true,
      sessions: {
        orderBy: { scheduledFor: "desc" },
        take: 10,
        include: { attendance: { include: { student: true } } },
      },
      payments: {
        orderBy: { paidAt: "desc" },
        take: 10,
      },
    },
  });
}

export async function getEnrollmentForAssistant(
  id: string,
  discountPage = 1,
  discountLimit = 20,
) {
  return prisma.enrollment.findUnique({
    where: { id },
    select: {
      id: true,
      studentId: true,
      tutorId: true,
      subjectId: true,
      packageId: true,
      groupId: true,
      status: true,
      startDate: true,
      endDate: true,
      priceAtEnrollment: true,
      customPriceOverride: true,
      createdAt: true,
      updatedAt: true,
      student: {
        select: { id: true, firstName: true, lastName: true },
      },
      tutor: {
        select: { id: true, firstName: true, lastName: true },
      },
      subject: { select: { id: true, name: true } },
      package: {
        select: {
          id: true,
          name: true,
          type: true,
          billingPeriod: true,
          lessonType: true,
          basePrice: true,
          sessionsPerWeek: true,
          durationMinutes: true,
        },
      },
      group: { select: { id: true, name: true } },
      discounts: {
        select: {
          id: true,
          kind: true,
          value: true,
          temporary: true,
          validFrom: true,
          validUntil: true,
          usesRemaining: true,
        },
        orderBy: [{ createdAt: "desc" }, { id: "asc" }],
        skip: (discountPage - 1) * discountLimit,
        take: discountLimit,
      },
      _count: { select: { discounts: true, sessions: true, payments: true } },
    },
  });
}

export async function createEnrollment(data: {
  studentId: string;
  packageId: string;
  tutorId: string;
  subjectId: string;
  startDate: Date;
  endDate?: Date | null;
  priceAtEnrollment: string;
  customPriceOverride?: string | null;
  groupId?: string | null;
}) {
  return prisma.enrollment.create({ data });
}

export async function createEnrollmentWithNewGroup(
  data: Omit<Parameters<typeof createEnrollment>[0], "groupId">,
  group: { name: string; tutorId: string; subjectId: string },
) {
  return prisma.$transaction(async (tx) => {
    const createdGroup = await tx.group.create({ data: group });
    return tx.enrollment.create({
      data: { ...data, groupId: createdGroup.id },
    });
  });
}

export async function updateEnrollmentLifecycle(input: {
  id: string;
  data: {
    endDate?: Date | null;
    status?: EnrollmentStatus;
    customPriceOverride?: string | null;
  };
  scheduleCutoffExclusive?: Date;
  closeRecurrencesOn?: Date;
  groupId?: string | null;
}) {
  return prisma.$transaction(async (tx) => {
    const updated = await tx.enrollment.update({
      where: { id: input.id },
      data: input.data,
    });

    if (input.scheduleCutoffExclusive) {
      await tx.sessionAttendance.deleteMany({
        where: {
          enrollmentId: input.id,
          status: "SCHEDULED",
          session: {
            scheduledFor: { gte: input.scheduleCutoffExclusive },
          },
        },
      });
      await tx.session.deleteMany({
        where: {
          enrollmentId: input.id,
          status: "SCHEDULED",
          scheduledFor: { gte: input.scheduleCutoffExclusive },
        },
      });

      if (input.groupId) {
        await tx.session.deleteMany({
          where: {
            enrollmentId: null,
            status: "SCHEDULED",
            scheduledFor: { gte: input.scheduleCutoffExclusive },
            recurrenceRule: { groupId: input.groupId },
            attendance: { none: {} },
          },
        });
      }
    }

    if (input.closeRecurrencesOn) {
      await tx.recurrenceRule.deleteMany({
        where: {
          enrollmentId: input.id,
          startsOn: { gt: input.closeRecurrencesOn },
        },
      });
      await tx.recurrenceRule.updateMany({
        where: {
          enrollmentId: input.id,
          startsOn: { lte: input.closeRecurrencesOn },
          OR: [{ endsOn: null }, { endsOn: { gt: input.closeRecurrencesOn } }],
        },
        data: { endsOn: input.closeRecurrencesOn },
      });
    }

    return updated;
  });
}

export async function createDiscount(data: {
  enrollmentId?: string;
  studentId?: string;
  kind:
    | "PERCENT_OFF"
    | "FIXED_OFF"
    | "FREE_SESSIONS"
    | "FREE_MONTH"
    | "REDUCED_RATE";
  value: string;
  temporary: boolean;
  validFrom?: Date | null;
  validUntil?: Date | null;
  usesRemaining?: number | null;
  notes?: string;
}) {
  return prisma.discount.create({ data });
}

export async function deleteDiscount(id: string) {
  return prisma.discount.delete({ where: { id } });
}

export async function getDiscountWithEnrollment(id: string) {
  return prisma.discount.findUnique({
    where: { id },
    include: {
      enrollment: {
        include: {
          student: true,
          package: true,
          tutor: true,
          subject: true,
          discounts: true,
          group: true,
          sessions: {
            orderBy: { scheduledFor: "desc" },
            take: 10,
            include: { attendance: { include: { student: true } } },
          },
          payments: {
            orderBy: { paidAt: "desc" },
            take: 10,
          },
        },
      },
    },
  });
}

export function getDiscountForAssistant(id: string) {
  return prisma.discount.findUnique({
    where: { id },
    select: {
      id: true,
      enrollmentId: true,
      kind: true,
      value: true,
      temporary: true,
      validFrom: true,
      validUntil: true,
      usesRemaining: true,
    },
  });
}

export function getTutorSubjectAssignment(tutorId: string, subjectId: string) {
  return prisma.tutorSubject.findUnique({
    where: { tutorId_subjectId: { tutorId, subjectId } },
  });
}

export function findActiveEnrollmentForSubject(
  studentId: string,
  subjectId: string,
) {
  return prisma.enrollment.findFirst({
    where: { studentId, subjectId, status: "ACTIVE" },
  });
}

export function getPackageForEnrollment(id: string) {
  return prisma.package.findUnique({ where: { id } });
}

export function getGroupAssignment(id: string) {
  return prisma.group.findUnique({ where: { id } });
}
