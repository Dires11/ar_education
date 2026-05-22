"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/utils/auth";
import { updateExistingGroup } from "@/lib/services/groups";
import type { UpdateGroupInput } from "@/lib/validators/groups";

export async function updateGroupAction(
  groupId: string,
  input: UpdateGroupInput
) {
  await requireAdmin();
  try {
    const group = await updateExistingGroup(groupId, input);
    revalidatePath("/enrollments");
    revalidatePath("/schedule");
    return { success: true, id: group.id };
  } catch (error) {
    if (
      typeof error === "object" &&
      error !== null &&
      "code" in error &&
      error.code === "P2002"
    ) {
      throw new Error("A group with this name already exists for that tutor.");
    }

    throw error;
  }
}
