"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/utils/auth";
import { archiveAssistantThreadSchema } from "@/lib/validators/assistant";
import { setAssistantThreadArchived } from "@/lib/services/assistant/threads";

export async function archiveAssistantThreadAction(
  threadId: string,
  archived = true,
) {
  const admin = await requireAdmin();
  const input = archiveAssistantThreadSchema.parse({ threadId, archived });
  await setAssistantThreadArchived(admin.id, input.threadId, input.archived);
  revalidatePath("/assistant");
  return { success: true };
}
