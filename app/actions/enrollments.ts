"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/utils/auth";
import {
  createEnrollmentForStudent,
  updateEnrollmentStatus,
  addDiscountToEnrollment,
  removeDiscount,
  getEnrollment,
  listGroups,
} from "@/lib/services/enrollments";
import { listGroupsForTutorSubject } from "@/lib/services/groups";
import type {
  CreateEnrollmentInput,
  UpdateEnrollmentInput,
  CreateDiscountInput,
} from "@/lib/validators/enrollments";
import { idSchema } from "@/lib/validators/common";

export async function createEnrollmentAction(input: CreateEnrollmentInput) {
  await requireAdmin();
  const enrollment = await createEnrollmentForStudent(input);
  revalidatePath("/enrollments");
  revalidatePath(`/students/${input.studentId}`);
  return { success: true, id: enrollment.id };
}

export async function updateEnrollmentAction(
  id: string,
  studentId: string,
  input: UpdateEnrollmentInput
) {
  await requireAdmin();
  id = idSchema.parse(id);
  studentId = idSchema.parse(studentId);
  await updateEnrollmentStatus(id, input);
  revalidatePath("/enrollments");
  revalidatePath(`/students/${studentId}`);
  return { success: true };
}

export async function addDiscountAction(
  enrollmentId: string,
  studentId: string,
  input: CreateDiscountInput
) {
  await requireAdmin();
  enrollmentId = idSchema.parse(enrollmentId);
  studentId = idSchema.parse(studentId);
  await addDiscountToEnrollment(enrollmentId, input);
  revalidatePath("/enrollments");
  revalidatePath(`/students/${studentId}`);
  return { success: true };
}

export async function removeDiscountAction(
  discountId: string,
  enrollmentId: string,
  studentId: string
) {
  await requireAdmin();
  discountId = idSchema.parse(discountId);
  enrollmentId = idSchema.parse(enrollmentId);
  studentId = idSchema.parse(studentId);
  await removeDiscount(discountId);
  revalidatePath("/enrollments");
  revalidatePath(`/students/${studentId}`);
  return { success: true };
}

export async function getEnrollmentAction(enrollmentId: string) {
  await requireAdmin();
  enrollmentId = idSchema.parse(enrollmentId);
  const enrollment = await getEnrollment(enrollmentId);
  if (!enrollment) return null;
  return JSON.parse(JSON.stringify(enrollment)) as typeof enrollment;
}

export async function listGroupsForTutorSubjectAction(
  tutorId: string,
  subjectId: string
) {
  await requireAdmin();
  return listGroupsForTutorSubject(
    idSchema.parse(tutorId),
    idSchema.parse(subjectId),
  );
}

export async function listAllGroupsAction() {
  await requireAdmin();
  return listGroups();
}
