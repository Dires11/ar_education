"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/utils/auth";
import {
  createTutorWithSubjects,
  updateTutorProfile,
  updateTutorSubjectsList,
  archiveTutorById,
  getTutor,
} from "@/lib/services/tutors";
import type {
  CreateTutorInput,
  UpdateTutorInput,
} from "@/lib/validators/tutors";
import { idSchema } from "@/lib/validators/common";
import { z } from "zod";

export async function createTutorAction(input: CreateTutorInput) {
  await requireAdmin();
  const tutor = await createTutorWithSubjects(input);
  revalidatePath("/tutors");
  return { success: true, id: tutor.id };
}

export async function updateTutorAction(id: string, input: UpdateTutorInput) {
  await requireAdmin();
  id = idSchema.parse(id);
  await updateTutorProfile(id, input);
  revalidatePath("/tutors");
  revalidatePath(`/tutors/${id}`);
  return { success: true };
}

export async function updateTutorSubjectsAction(
  id: string,
  subjectIds: string[]
) {
  await requireAdmin();
  id = idSchema.parse(id);
  await updateTutorSubjectsList(
    id,
    z.array(idSchema).min(1).max(100).parse(subjectIds),
  );
  revalidatePath(`/tutors/${id}`);
  return { success: true };
}

export async function archiveTutorAction(id: string) {
  await requireAdmin();
  id = idSchema.parse(id);
  await archiveTutorById(id);
  revalidatePath("/tutors");
  revalidatePath(`/tutors/${id}`);
  return { success: true };
}

export async function getTutorAction(id: string) {
  await requireAdmin();
  id = idSchema.parse(id);
  const tutor = await getTutor(id);
  return JSON.parse(JSON.stringify(tutor)) as typeof tutor;
}
