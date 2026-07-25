import "server-only";

import {
  createSubject,
  deleteSubject,
  updateSubject,
} from "@/lib/data/subjects";
import {
  createSubjectSchema,
  type CreateSubjectInput,
} from "@/lib/validators/subjects";

export function createSubjectOffering(input: CreateSubjectInput) {
  return createSubject(createSubjectSchema.parse(input));
}

export function updateSubjectOffering(
  id: string,
  input: CreateSubjectInput,
) {
  return updateSubject(id, createSubjectSchema.parse(input));
}

export function deleteSubjectOffering(id: string) {
  return deleteSubject(id);
}
