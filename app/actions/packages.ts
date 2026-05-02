"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/utils/auth";
import { createPackage, updatePackage } from "@/lib/data/packages";
import {
  createPackageSchema,
  type CreatePackageInput,
} from "@/lib/validators/packages";

export async function createPackageAction(input: CreatePackageInput) {
  await requireAdmin();
  const parsed = createPackageSchema.parse(input);

  const pkg = await createPackage({
    name: parsed.name,
    type: parsed.type,
    billingPeriod:
      parsed.type === "MONTHLY" ? parsed.billingPeriod ?? "MONTHLY" : "MONTHLY",
    lessonType: parsed.lessonType ?? "PRIVATE",
    subjectId: parsed.subjectId || undefined,
    basePrice: parsed.basePrice,
    sessionsPerWeek:
      parsed.type === "MONTHLY" && parsed.sessionsPerWeek
        ? Number(parsed.sessionsPerWeek)
        : null,
    durationMinutes: Number(parsed.durationMinutes),
  });

  revalidatePath("/packages");
  return { success: true, id: pkg.id };
}

export async function updatePackageAction(
  id: string,
  input: CreatePackageInput
) {
  await requireAdmin();
  const parsed = createPackageSchema.parse(input);

  await updatePackage(id, {
    name: parsed.name,
    type: parsed.type,
    billingPeriod:
      parsed.type === "MONTHLY" ? parsed.billingPeriod ?? "MONTHLY" : "MONTHLY",
    lessonType: parsed.lessonType ?? "PRIVATE",
    subjectId: parsed.subjectId || null,
    basePrice: parsed.basePrice,
    sessionsPerWeek:
      parsed.type === "MONTHLY" && parsed.sessionsPerWeek
        ? Number(parsed.sessionsPerWeek)
        : null,
    durationMinutes: Number(parsed.durationMinutes),
  });

  revalidatePath("/packages");
  return { success: true };
}

export async function togglePackageActiveAction(
  id: string,
  isActive: boolean
) {
  await requireAdmin();
  await updatePackage(id, { isActive });
  revalidatePath("/packages");
  return { success: true };
}
