"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/utils/auth";
import {
  createEnrollmentForStudent,
  updateEnrollmentStatus,
  addDiscountToEnrollment,
  removeDiscount,
} from "@/lib/services/enrollments";
import type {
  CreateEnrollmentInput,
  UpdateEnrollmentInput,
  CreateDiscountInput,
} from "@/lib/validators/enrollments";

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
  await updateEnrollmentStatus(id, input);
  revalidatePath("/enrollments");
  revalidatePath(`/enrollments/${id}`);
  revalidatePath(`/students/${studentId}`);
  return { success: true };
}

export async function addDiscountAction(
  enrollmentId: string,
  studentId: string,
  input: CreateDiscountInput
) {
  await requireAdmin();
  await addDiscountToEnrollment(enrollmentId, input);
  revalidatePath(`/enrollments/${enrollmentId}`);
  revalidatePath(`/students/${studentId}`);
  return { success: true };
}

export async function removeDiscountAction(
  discountId: string,
  enrollmentId: string,
  studentId: string
) {
  await requireAdmin();
  await removeDiscount(discountId);
  revalidatePath(`/enrollments/${enrollmentId}`);
  revalidatePath(`/students/${studentId}`);
  return { success: true };
}
