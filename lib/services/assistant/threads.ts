import "server-only";

import { archiveAssistantThread } from "@/lib/data/assistant";

export async function setAssistantThreadArchived(
  adminId: string,
  threadId: string,
  archived: boolean,
) {
  return archiveAssistantThread(adminId, threadId, archived);
}
