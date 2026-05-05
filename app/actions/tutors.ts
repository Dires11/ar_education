"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/utils/auth";
import {
  createTutorWithSubjects,
  updateTutorProfile,
  updateTutorSubjectsList,
  archiveTutorById,
} from "@/lib/services/tutors";
import { getTutor } from "@/lib/data/tutors";
import type {
  CreateTutorInput,
  UpdateTutorInput,
} from "@/lib/validators/tutors";

export async function createTutorAction(input: CreateTutorInput) {
  await requireAdmin();
  const tutor = await createTutorWithSubjects(input);
  revalidatePath("/tutors");
  return { success: true, id: tutor.id };
}

export async function updateTutorAction(id: string, input: UpdateTutorInput) {
  await requireAdmin();
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
  await updateTutorSubjectsList(id, subjectIds);
  revalidatePath(`/tutors/${id}`);
  return { success: true };
}

export async function archiveTutorAction(id: string) {
  await requireAdmin();
  await archiveTutorById(id);
  revalidatePath("/tutors");
  revalidatePath(`/tutors/${id}`);
  return { success: true };
}

export async function getTutorAction(id: string) {
  await requireAdmin();
  const tutor = await getTutor(id);
  return JSON.parse(JSON.stringify(tutor)) as typeof tutor;
}
