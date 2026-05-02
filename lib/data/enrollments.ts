import { prisma } from "@/lib/prisma";
import { EnrollmentStatus } from "../../generated/prisma";

export async function listEnrollments(filters?: {
  studentId?: string;
  tutorId?: string;
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
    },
    orderBy: { createdAt: "desc" },
  });
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

export async function createEnrollment(data: {
  studentId: string;
  packageId: string;
  tutorId: string;
  subjectId: string;
  startDate: Date;
  endDate?: Date | null;
  customPriceOverride?: string | null;
}) {
  return prisma.enrollment.create({ data });
}

export async function updateEnrollment(
  id: string,
  data: {
    endDate?: Date | null;
    status?: EnrollmentStatus;
    customPriceOverride?: string | null;
  }
) {
  return prisma.enrollment.update({ where: { id }, data });
}

export async function createDiscount(data: {
  enrollmentId?: string;
  studentId?: string;
  kind: "PERCENT_OFF" | "FIXED_OFF" | "FREE_SESSIONS" | "FREE_MONTH" | "REDUCED_RATE";
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
