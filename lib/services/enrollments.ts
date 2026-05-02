import {
  createEnrollment,
  updateEnrollment,
  createDiscount,
  deleteDiscount,
  getEnrollment,
  listEnrollments,
} from "@/lib/data/enrollments";
import {
  createEnrollmentSchema,
  updateEnrollmentSchema,
  createDiscountSchema,
  type CreateEnrollmentInput,
  type UpdateEnrollmentInput,
  type CreateDiscountInput,
} from "@/lib/validators/enrollments";
import { prisma } from "@/lib/prisma";

export async function createEnrollmentForStudent(input: CreateEnrollmentInput) {
  const parsed = createEnrollmentSchema.parse(input);

  // Validate tutor teaches this subject
  const tutorSubject = await prisma.tutorSubject.findUnique({
    where: {
      tutorId_subjectId: {
        tutorId: parsed.tutorId,
        subjectId: parsed.subjectId,
      },
    },
  });

  if (!tutorSubject) {
    throw new Error("Tutor does not teach the selected subject");
  }

  return createEnrollment({
    studentId: parsed.studentId,
    packageId: parsed.packageId,
    tutorId: parsed.tutorId,
    subjectId: parsed.subjectId,
    startDate: new Date(parsed.startDate),
    endDate: parsed.endDate ? new Date(parsed.endDate) : null,
    customPriceOverride: parsed.customPriceOverride || null,
  });
}

export async function updateEnrollmentStatus(
  id: string,
  input: UpdateEnrollmentInput
) {
  const parsed = updateEnrollmentSchema.parse(input);
  return updateEnrollment(id, {
    status: parsed.status,
    endDate: parsed.endDate ? new Date(parsed.endDate) : undefined,
    customPriceOverride: parsed.customPriceOverride || null,
  });
}

export async function addDiscountToEnrollment(
  enrollmentId: string,
  input: CreateDiscountInput
) {
  const parsed = createDiscountSchema.parse(input);
  return createDiscount({
    enrollmentId,
    kind: parsed.kind,
    value: parsed.value,
    temporary: parsed.temporary,
    validFrom: parsed.validFrom ? new Date(parsed.validFrom) : null,
    validUntil: parsed.validUntil ? new Date(parsed.validUntil) : null,
    usesRemaining: parsed.usesRemaining ? Number(parsed.usesRemaining) : null,
    notes: parsed.notes,
  });
}

export async function removeDiscount(id: string) {
  return deleteDiscount(id);
}

export { getEnrollment, listEnrollments };
