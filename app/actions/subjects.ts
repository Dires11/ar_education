"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/utils/auth";
import {
  createSubject,
  updateSubject,
  deleteSubject,
} from "@/lib/data/subjects";
import {
  createSubjectSchema,
  type CreateSubjectInput,
} from "@/lib/validators/subjects";

export async function createSubjectAction(input: CreateSubjectInput) {
  await requireAdmin();
  const parsed = createSubjectSchema.parse(input);
  const subject = await createSubject(parsed);
  revalidatePath("/subjects");
  return { success: true, id: subject.id };
}

export async function updateSubjectAction(
  id: string,
  input: CreateSubjectInput
) {
  await requireAdmin();
  const parsed = createSubjectSchema.parse(input);
  await updateSubject(id, parsed);
  revalidatePath("/subjects");
  return { success: true };
}

export async function deleteSubjectAction(id: string) {
  await requireAdmin();
  await deleteSubject(id);
  revalidatePath("/subjects");
  return { success: true };
}
