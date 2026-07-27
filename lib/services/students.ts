import "server-only";

import {
  createStudentWithGuardianData,
  updateStudent,
  updateStudentStatus,
  deleteStudent,
  archiveStudent,
  createGuardianAndLink,
  updateGuardian,
  unlinkGuardian,
  setGuardianPrimary,
  getStudent,
  getGuardian,
  queryStudentDirectoryData,
} from "@/lib/data/students";
import {
  createStudentSchema,
  studentDirectoryQuerySchema,
  updateStudentSchema,
  type CreateStudentInput,
  type StudentDirectoryQueryInput,
  type UpdateStudentInput,
  type GuardianInput,
  guardianSchema,
} from "@/lib/validators/students";
import { PersonStatus } from "@/generated/prisma";
import { deleteCloudinaryImageIfUnreferenced } from "@/lib/services/media";

export async function createStudentWithGuardian(input: CreateStudentInput) {
  const parsed = createStudentSchema.parse(input);

  const dob = parsed.dob ? new Date(parsed.dob) : null;

  const guardianData = parsed.guardian
    ? {
        ...parsed.guardian,
        email: parsed.guardian.email || undefined,
        avatarUrl: parsed.guardian.avatarUrl || undefined,
        avatarPublicId: parsed.guardian.avatarPublicId || undefined,
        isPrimary: parsed.guardian.isPrimary ?? true,
      }
    : undefined;

  return createStudentWithGuardianData(
    {
      firstName: parsed.firstName,
      lastName: parsed.lastName,
      avatarUrl: parsed.avatarUrl || undefined,
      avatarPublicId: parsed.avatarPublicId || undefined,
      dob,
      email: parsed.email || undefined,
      phone: parsed.phone || undefined,
      school: parsed.school,
      gradeLevel: parsed.gradeLevel,
      notes: parsed.notes,
    },
    guardianData,
  );
}

export async function queryStudentDirectory(
  input: StudentDirectoryQueryInput,
) {
  const parsed = studentDirectoryQuerySchema.parse(input);
  return queryStudentDirectoryData(parsed);
}

export async function updateStudentProfile(
  id: string,
  input: UpdateStudentInput
) {
  const parsed = updateStudentSchema.parse(input);
  const dob = parsed.dob ? new Date(parsed.dob) : undefined;
  const existing = await getStudent(id);
  if (!existing) throw new Error("Student not found");
  const updated = await updateStudent(id, {
    ...parsed,
    dob,
    avatarUrl: parsed.avatarUrl || null,
    avatarPublicId: parsed.avatarPublicId || null,
    email: parsed.email || undefined,
    phone: parsed.phone || undefined,
  });
  if (
    existing.avatarPublicId &&
    existing.avatarPublicId !== updated.avatarPublicId
  ) {
    deleteCloudinaryImageIfUnreferenced(
      existing.avatarPublicId,
    ).catch(console.error);
  }
  return updated;
}

export async function archiveStudentById(id: string) {
  return archiveStudent(id);
}

export async function updateStudentStatusById(
  id: string,
  status: PersonStatus
) {
  return updateStudentStatus(id, status);
}

export async function deleteStudentById(id: string) {
  return deleteStudent(id);
}

export async function addGuardianToStudent(
  studentId: string,
  input: GuardianInput
) {
  const { isPrimary = false, ...guardianData } = input;
  const email = input.email || undefined;
  return createGuardianAndLink(
    studentId,
    { ...guardianData, email },
    isPrimary,
  );
}

export async function updateGuardianDetails(
  guardianId: string,
  studentId: string,
  input: Partial<GuardianInput>
) {
  const parsed = guardianSchema.partial().parse(input);
  const existing = await getGuardian(guardianId);
  if (!existing) throw new Error("Guardian not found");
  const email = parsed.email || undefined;
  const updated = await updateGuardian(guardianId, {
    firstName: parsed.firstName,
    lastName: parsed.lastName,
    avatarUrl:
      parsed.avatarUrl === undefined ? undefined : parsed.avatarUrl || null,
    avatarPublicId:
      parsed.avatarPublicId === undefined
        ? undefined
        : parsed.avatarPublicId || null,
    phone: parsed.phone,
    email,
    relationship: parsed.relationship,
    notes: parsed.notes,
  });
  if (parsed.isPrimary !== undefined) {
    await setGuardianPrimary(studentId, guardianId, parsed.isPrimary);
  }
  if (
    existing.avatarPublicId &&
    existing.avatarPublicId !== updated.avatarPublicId
  ) {
    deleteCloudinaryImageIfUnreferenced(
      existing.avatarPublicId,
    ).catch(console.error);
  }
  return updated;
}

export async function removeGuardianFromStudent(
  studentId: string,
  guardianId: string
) {
  return unlinkGuardian(studentId, guardianId);
}

export { getStudent };
