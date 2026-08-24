import { requireAdmin } from "@/lib/utils/auth";
import {
  assistantHistoryMessageDto,
  getAssistantPageData,
  isAssistantConfigured,
} from "@/lib/services/assistant/orchestrator";
import { AssistantShell } from "./assistant-shell";

export default async function AssistantPage({
  searchParams,
}: {
  searchParams: Promise<{ thread?: string; new?: string }>;
}) {
  const admin = await requireAdmin();
  const { thread, new: newThread } = await searchParams;
  const data = await getAssistantPageData(admin.id, thread);
  const selectedThreadData = newThread === "1" ? null : data.selectedThread;

  const threads = data.threads.map((item) => ({
    id: item.id,
    title: item.title,
    updatedAt: item.updatedAt.toISOString(),
    messageCount: item._count.messages,
  }));

  const selectedThread = selectedThreadData
    ? {
        id: selectedThreadData.id,
        title: selectedThreadData.title,
        messages: selectedThreadData.messages.map((message) =>
          assistantHistoryMessageDto(message, admin.role),
        ),
        hasMoreMessages: selectedThreadData.hasMore,
        messageCursor: selectedThreadData.nextCursor
          ? {
              at: selectedThreadData.nextCursor.createdAt.toISOString(),
              id: selectedThreadData.nextCursor.id,
            }
          : null,
      }
    : null;

  return (
    <AssistantShell
      configured={isAssistantConfigured()}
      initialThreads={threads}
      initialHasMoreThreads={data.hasMoreThreads}
      initialThreadCursor={
        data.nextThreadCursor
          ? {
              at: data.nextThreadCursor.updatedAt.toISOString(),
              id: data.nextThreadCursor.id,
            }
          : null
      }
      initialThread={selectedThread}
    />
  );
}
