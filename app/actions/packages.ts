"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/utils/auth";
import type { CreatePackageInput } from "@/lib/validators/packages";
import { idSchema } from "@/lib/validators/common";
import { z } from "zod";
import {
  createPackageOffering,
  setPackageActive,
  updatePackageOffering,
} from "@/lib/services/packages";

export async function createPackageAction(input: CreatePackageInput) {
  await requireAdmin();
  const pkg = await createPackageOffering(input);

  revalidatePath("/packages");
  return { success: true, id: pkg.id };
}

export async function updatePackageAction(
  id: string,
  input: CreatePackageInput
) {
  await requireAdmin();
  id = idSchema.parse(id);
  await updatePackageOffering(id, input);

  revalidatePath("/packages");
  return { success: true };
}

export async function togglePackageActiveAction(
  id: string,
  isActive: boolean
) {
  await requireAdmin();
  await setPackageActive(
    idSchema.parse(id),
    z.boolean().parse(isActive),
  );
  revalidatePath("/packages");
  return { success: true };
}
