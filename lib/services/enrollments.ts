import "server-only";

import {
  createEnrollment,
  createEnrollmentWithNewGroup,
  updateEnrollment,
  createDiscount,
  deleteDiscount,
  getEnrollment,
  listEnrollments,
  findActiveEnrollmentForSubject,
  getGroupAssignment,
  getPackageForEnrollment,
  getTutorSubjectAssignment,
} from "@/lib/data/enrollments";
import {
  createEnrollmentSchema,
  updateEnrollmentSchema,
  createDiscountSchema,
  type CreateEnrollmentInput,
  type UpdateEnrollmentInput,
  type CreateDiscountInput,
} from "@/lib/validators/enrollments";
import { deleteGroupWhenEmpty } from "@/lib/services/groups";
import { listGroups } from "@/lib/data/groups";

export async function createEnrollmentForStudent(input: CreateEnrollmentInput) {
  const parsed = createEnrollmentSchema.parse(input);

  const tutorSubject = await getTutorSubjectAssignment(
    parsed.tutorId,
    parsed.subjectId,
  );
  if (!tutorSubject) {
    throw new Error("Tutor does not teach the selected subject");
  }

  const existing = await findActiveEnrollmentForSubject(
    parsed.studentId,
    parsed.subjectId,
  );
  if (existing) {
    throw new Error(
      "This student already has an active enrollment for this subject"
    );
  }

  const selectedPackage = await getPackageForEnrollment(parsed.packageId);
  if (!selectedPackage || !selectedPackage.isActive) {
    throw new Error("Selected package is not available");
  }
  if (
    selectedPackage.subjectId &&
    selectedPackage.subjectId !== parsed.subjectId
  ) {
    throw new Error("Selected package is for a different subject");
  }

  let groupId: string | null = null;
  let newGroup: { name: string; tutorId: string; subjectId: string } | null =
    null;
  if (selectedPackage?.lessonType === "GROUP") {
    if (!parsed.groupId && !parsed.newGroupName) {
      throw new Error("Group is required for group packages");
    }
    if (parsed.groupId) {
      groupId = parsed.groupId;
      const group = await getGroupAssignment(groupId);
      if (
        !group ||
        group.tutorId !== parsed.tutorId ||
        group.subjectId !== parsed.subjectId
      ) {
        throw new Error("Selected group does not match the tutor and subject");
      }
    } else {
      newGroup = {
        name: parsed.newGroupName!,
        tutorId: parsed.tutorId,
        subjectId: parsed.subjectId,
      };
    }
  } else if (parsed.groupId || parsed.newGroupName) {
    throw new Error("Only group packages can be assigned to a group");
  }

  const enrollmentData = {
    studentId: parsed.studentId,
    packageId: parsed.packageId,
    tutorId: parsed.tutorId,
    subjectId: parsed.subjectId,
    startDate: new Date(parsed.startDate),
    endDate: parsed.endDate ? new Date(parsed.endDate) : null,
    priceAtEnrollment: selectedPackage.basePrice.toString(),
    customPriceOverride: parsed.customPriceOverride || null,
  };
  if (newGroup) {
    return createEnrollmentWithNewGroup(enrollmentData, newGroup);
  }
  return createEnrollment({ ...enrollmentData, groupId });
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
