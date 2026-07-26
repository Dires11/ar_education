"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/utils/auth";
import type { CreateSubjectInput } from "@/lib/validators/subjects";
import { idSchema } from "@/lib/validators/common";
import {
  createSubjectOffering,
  deleteSubjectOffering,
  updateSubjectOffering,
} from "@/lib/services/subjects";

export async function createSubjectAction(input: CreateSubjectInput) {
  await requireAdmin();
  const subject = await createSubjectOffering(input);
  revalidatePath("/subjects");
  return { success: true, id: subject.id };
}

export async function updateSubjectAction(
  id: string,
  input: CreateSubjectInput
) {
  await requireAdmin();
  id = idSchema.parse(id);
  await updateSubjectOffering(id, input);
  revalidatePath("/subjects");
  return { success: true };
}

export async function deleteSubjectAction(id: string) {
  await requireAdmin();
  await deleteSubjectOffering(idSchema.parse(id));
  revalidatePath("/subjects");
  return { success: true };
}
