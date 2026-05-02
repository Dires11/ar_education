import {
  createStudent,
  updateStudent,
  updateStudentStatus,
  deleteStudent,
  archiveStudent,
  createGuardian,
  linkGuardian,
  updateGuardian,
  unlinkGuardian,
  setGuardianPrimary,
  getStudent,
} from "@/lib/data/students";
import {
  createStudentSchema,
  updateStudentSchema,
  type CreateStudentInput,
  type UpdateStudentInput,
  type GuardianInput,
} from "@/lib/validators/students";
import { PersonStatus } from "@/generated/prisma";

export async function createStudentWithGuardian(input: CreateStudentInput) {
  const parsed = createStudentSchema.parse(input);

  const dob = parsed.dob ? new Date(parsed.dob) : null;

  const student = await createStudent({
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
  });

  if (parsed.guardian) {
    const { isPrimary, ...guardianData } = parsed.guardian;
    const email = guardianData.email || undefined;
    const guardian = await createGuardian({ ...guardianData, email });
    await linkGuardian(student.id, guardian.id, isPrimary ?? true);
  }

  return student;
}

export async function updateStudentProfile(
  id: string,
  input: UpdateStudentInput
) {
  const parsed = updateStudentSchema.parse(input);
  const dob = parsed.dob ? new Date(parsed.dob) : undefined;
  return updateStudent(id, {
    ...parsed,
    dob,
    avatarUrl: parsed.avatarUrl || undefined,
    avatarPublicId: parsed.avatarPublicId || undefined,
    email: parsed.email || undefined,
    phone: parsed.phone || undefined,
  });
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
  const guardian = await createGuardian({ ...guardianData, email });
  await linkGuardian(studentId, guardian.id, isPrimary);
  if (isPrimary) {
    await setGuardianPrimary(studentId, guardian.id, true);
  }
  return guardian;
}

export async function updateGuardianDetails(
  guardianId: string,
  studentId: string,
  input: Partial<GuardianInput>
) {
  const email = input.email || undefined;
  await updateGuardian(guardianId, {
    firstName: input.firstName,
    lastName: input.lastName,
    avatarUrl: input.avatarUrl,
    avatarPublicId: input.avatarPublicId,
    phone: input.phone,
    email,
    relationship: input.relationship,
    notes: input.notes,
  });
  if (input.isPrimary !== undefined) {
    await setGuardianPrimary(studentId, guardianId, input.isPrimary);
  }
}

export async function removeGuardianFromStudent(
  studentId: string,
  guardianId: string
) {
  return unlinkGuardian(studentId, guardianId);
}

export { getStudent };
