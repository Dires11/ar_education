import {
  createGroup,
  listGroupsByTutorAndSubject,
  getGroupWithMembers,
} from "@/lib/data/groups";
import { deleteFutureGroupAttendanceForStudent } from "@/lib/data/sessions";

export async function findOrCreateGroup(
  input:
    | { existingGroupId: string }
    | { name: string; tutorId: string; subjectId: string }
): Promise<string> {
  if ("existingGroupId" in input) return input.existingGroupId;
  const group = await createGroup({
    name: input.name,
    tutorId: input.tutorId,
    subjectId: input.subjectId,
  });
  return group.id;
}

export async function listGroupsForTutorSubject(
  tutorId: string,
  subjectId: string
) {
  return listGroupsByTutorAndSubject(tutorId, subjectId);
}

export async function removeStudentFromGroup(
  studentId: string,
  fromDate: Date
) {
  await deleteFutureGroupAttendanceForStudent(studentId, fromDate);
}

export { getGroupWithMembers };
