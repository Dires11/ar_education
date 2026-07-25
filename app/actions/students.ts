"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/utils/auth";
import {
  createStudentWithGuardian,
  updateStudentProfile,
  updateStudentStatusById,
  deleteStudentById,
  archiveStudentById,
  addGuardianToStudent,
  updateGuardianDetails,
  removeGuardianFromStudent,
  getStudent,
} from "@/lib/services/students";
import { PersonStatus } from "@/generated/prisma";
import type {
  CreateStudentInput,
  UpdateStudentInput,
  GuardianInput,
} from "@/lib/validators/students";
import { idSchema } from "@/lib/validators/common";
import { z } from "zod";

export async function createStudentAction(input: CreateStudentInput) {
  await requireAdmin();
  const student = await createStudentWithGuardian(input);
  revalidatePath("/students");
  return { success: true, id: student.id };
}

export async function updateStudentAction(
  id: string,
  input: UpdateStudentInput
) {
  await requireAdmin();
  id = idSchema.parse(id);
  await updateStudentProfile(id, input);
  revalidatePath("/students");
  revalidatePath(`/students/${id}`);
  return { success: true };
}

export async function archiveStudentAction(id: string) {
  await requireAdmin();
  id = idSchema.parse(id);
  await archiveStudentById(id);
  revalidatePath("/students");
  revalidatePath(`/students/${id}`);
  return { success: true };
}

export async function updateStudentStatusAction(
  id: string,
  status: PersonStatus
) {
  await requireAdmin();
  id = idSchema.parse(id);
  await updateStudentStatusById(
    id,
    z.enum(["ACTIVE", "PAUSED", "INACTIVE"]).parse(status),
  );
  revalidatePath("/students");
  revalidatePath(`/students/${id}`);
  return { success: true };
}

export async function deleteStudentAction(id: string) {
  await requireAdmin();
  id = idSchema.parse(id);
  await deleteStudentById(id);
  revalidatePath("/students");
  return { success: true };
}

export async function addGuardianAction(
  studentId: string,
  input: GuardianInput
) {
  await requireAdmin();
  studentId = idSchema.parse(studentId);
  const guardian = await addGuardianToStudent(studentId, input);
  revalidatePath(`/students/${studentId}`);
  return { success: true, id: guardian.id };
}

export async function updateGuardianAction(
  guardianId: string,
  studentId: string,
  input: Partial<GuardianInput>
) {
  await requireAdmin();
  guardianId = idSchema.parse(guardianId);
  studentId = idSchema.parse(studentId);
  await updateGuardianDetails(guardianId, studentId, input);
  revalidatePath("/students");
  revalidatePath(`/students/${studentId}`);
  return { success: true };
}

export async function removeGuardianAction(studentId: string, guardianId: string) {
  await requireAdmin();
  studentId = idSchema.parse(studentId);
  guardianId = idSchema.parse(guardianId);
  await removeGuardianFromStudent(studentId, guardianId);
  revalidatePath("/students");
  revalidatePath(`/students/${studentId}`);
  return { success: true };
}

export async function getStudentAction(studentId: string) {
  await requireAdmin();
  studentId = idSchema.parse(studentId);
  const student = await getStudent(studentId);
  if (!student) return null;
  // Prisma Decimal fields (e.g. package.basePrice, tutor.hourlyRate) are not
  // plain objects and cannot cross the server/client boundary as-is.
  // JSON round-trip serializes Decimals to strings and Dates to ISO strings.
  return JSON.parse(JSON.stringify(student)) as typeof student;
}
