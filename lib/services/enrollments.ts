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
import { deleteGroupWhenEmpty, findOrCreateGroup } from "@/lib/services/groups";
import { listGroups } from "@/lib/data/groups";

export async function createEnrollmentForStudent(input: CreateEnrollmentInput) {
  const parsed = createEnrollmentSchema.parse(input);

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

  const existing = await prisma.enrollment.findFirst({
    where: {
      studentId: parsed.studentId,
      subjectId: parsed.subjectId,
      status: "ACTIVE",
    },
  });
  if (existing) {
    throw new Error(
      "This student already has an active enrollment for this subject"
    );
  }

  const selectedPackage = await prisma.package.findUnique({
    where: { id: parsed.packageId },
  });

  let groupId: string | null = null;
  if (selectedPackage?.lessonType === "GROUP") {
    if (!parsed.groupId && !parsed.newGroupName) {
      throw new Error("Group is required for group packages");
    }
    groupId = await findOrCreateGroup(
      parsed.groupId
        ? { existingGroupId: parsed.groupId }
        : {
            name: parsed.newGroupName!,
            tutorId: parsed.tutorId,
            subjectId: parsed.subjectId,
          }
    );
  }

  return createEnrollment({
    studentId: parsed.studentId,
    packageId: parsed.packageId,
    tutorId: parsed.tutorId,
    subjectId: parsed.subjectId,
    startDate: new Date(parsed.startDate),
    endDate: parsed.endDate ? new Date(parsed.endDate) : null,
    customPriceOverride: parsed.customPriceOverride || null,
    groupId,
  });
}

export async function updateEnrollmentStatus(
  id: string,
  input: UpdateEnrollmentInput
) {
  const parsed = updateEnrollmentSchema.parse(input);
  const enrollment = await getEnrollment(id);
  const updated = await updateEnrollment(id, {
    status: parsed.status,
    endDate: parsed.endDate ? new Date(parsed.endDate) : undefined,
    customPriceOverride: parsed.customPriceOverride || null,
  });

  if (["COMPLETED", "CANCELLED"].includes(parsed.status)) {
    await deleteGroupWhenEmpty(enrollment?.groupId);
  }

  return updated;
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

export { getEnrollment, listEnrollments, listGroups };
