import "server-only";

import {
  createGroup,
  deleteGroupIfNoActiveMembers,
  listGroupsByTutorAndSubject,
  getGroupWithMembers,
  updateGroup,
} from "@/lib/data/groups";
import { deleteFutureGroupAttendanceForStudent } from "@/lib/data/sessions";
import {
  updateGroupSchema,
  type UpdateGroupInput,
} from "@/lib/validators/groups";

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

export async function updateExistingGroup(
  groupId: string,
  input: UpdateGroupInput
) {
  const parsed = updateGroupSchema.parse(input);
  return updateGroup(groupId, { name: parsed.name });
}

export async function removeStudentFromGroup(
  studentId: string,
  fromDate: Date
) {
  await deleteFutureGroupAttendanceForStudent(studentId, fromDate);
}

export async function deleteGroupWhenEmpty(groupId: string | null | undefined) {
  if (!groupId) return null;
  return deleteGroupIfNoActiveMembers(groupId);
}

export { getGroupWithMembers };
