import { requireAdmin } from "@/lib/utils/auth";
import {
  getAssistantPageData,
  isAssistantConfigured,
} from "@/lib/services/assistant/orchestrator";
import { parseAssistantAttachmentMetadata } from "@/lib/services/assistant/dto";
import { classifyFailedAssistantRun } from "@/lib/services/assistant/recovery";
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
        messages: selectedThreadData.messages.map((message) => {
          const recovery = message.run
            ? classifyFailedAssistantRun(message.run.toolRuns, admin.role)
            : null;
          return {
            id: message.id,
            role: message.role,
            content: message.content,
            createdAt: message.createdAt.toISOString(),
            attachments: parseAssistantAttachmentMetadata(message.attachments),
            failure:
              message.role === "USER" && message.run?.status === "FAILED"
                ? {
                    clientTurnId: message.run.clientTurnId,
                    error:
                      message.run.error ?? "This request did not complete.",
                    hasAttachments: message.run.hasAttachments,
                    outcomeUnknown: recovery?.outcomeUnknown ?? true,
                    retryable: recovery?.retryable ?? false,
                    reuseClientTurnId:
                      recovery?.reuseClientTurnId ?? false,
                  }
                : null,
            tools:
              message.role === "USER"
                ? (message.run?.toolRuns ?? []).map((tool) => ({
                    id: tool.id,
                    namespace: tool.namespace,
                    toolName: tool.toolName,
                    preview: tool.preview,
                    result: tool.result,
                    status: tool.status,
                    requiresConfirmation: tool.requiresConfirmation,
                    expiresAt: tool.expiresAt?.toISOString() ?? null,
                    error: tool.error,
                  }))
                : [],
          };
        }),
      }
    : null;

  return (
    <AssistantShell
      configured={isAssistantConfigured()}
      initialThreads={threads}
      initialThread={selectedThread}
    />
  );
}
