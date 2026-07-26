import "server-only";

import { prisma } from "@/lib/prisma";
import {
  AssistantMessageRole,
  AssistantRunStatus,
  AssistantToolRunStatus,
  Prisma,
} from "@/generated/prisma";

const ACTIVE_RUN_STATUSES: AssistantRunStatus[] = [
  "RUNNING",
  "WAITING_CONFIRMATION",
];

export async function listAssistantThreads(adminId: string) {
  return prisma.assistantThread.findMany({
    where: { adminId, archivedAt: null },
    orderBy: { updatedAt: "desc" },
    select: {
      id: true,
      title: true,
      updatedAt: true,
      _count: { select: { messages: true } },
    },
  });
}

export async function getAssistantThread(adminId: string, threadId: string) {
  return prisma.assistantThread.findFirst({
    where: { id: threadId, adminId },
    include: {
      messages: {
        orderBy: { createdAt: "asc" },
        include: {
          run: {
            select: {
              id: true,
              status: true,
              toolRuns: {
                orderBy: { createdAt: "asc" },
                select: {
                  id: true,
                  namespace: true,
                  toolName: true,
                  preview: true,
                  result: true,
                  status: true,
                  requiresConfirmation: true,
                  expiresAt: true,
                  error: true,
                },
              },
            },
          },
        },
      },
    },
  });
}

export async function getAssistantContext(
  adminId: string,
  threadId: string,
  take = 30,
) {
  const thread = await prisma.assistantThread.findFirst({
    where: { id: threadId, adminId },
    select: {
      contextSummary: true,
      messages: {
        orderBy: { createdAt: "desc" },
        take,
        select: {
          role: true,
          content: true,
          attachments: true,
          createdAt: true,
        },
      },
    },
  });
  if (!thread) return null;
  return {
    summary: thread.contextSummary,
    messages: thread.messages.reverse(),
  };
}

export async function setAssistantThreadSummary(
  adminId: string,
  threadId: string,
  contextSummary: string,
  summarizedMessageCount: number,
) {
  return prisma.assistantThread.updateMany({
    where: { id: threadId, adminId },
    data: { contextSummary, summarizedMessageCount },
  });
}

export async function getAssistantSummarySource(
  adminId: string,
  threadId: string,
  retainRecent = 20,
) {
  const thread = await prisma.assistantThread.findFirst({
    where: { id: threadId, adminId },
    select: {
      contextSummary: true,
      summarizedMessageCount: true,
      _count: { select: { messages: true } },
    },
  });
  if (!thread || thread._count.messages <= 40) return null;

  const summarizeThrough = Math.max(
    thread.summarizedMessageCount,
    thread._count.messages - retainRecent,
  );
  if (summarizeThrough <= thread.summarizedMessageCount) return null;

  const messages = await prisma.assistantMessage.findMany({
    where: { threadId },
    orderBy: { createdAt: "asc" },
    skip: thread.summarizedMessageCount,
    take: summarizeThrough - thread.summarizedMessageCount,
    select: { role: true, content: true },
  });
  return {
    previousSummary: thread.contextSummary,
    messages,
    summarizeThrough,
  };
}

function threadTitle(message: string) {
  const compact = message.replace(/\s+/g, " ").trim();
  return compact.length > 64 ? `${compact.slice(0, 61)}…` : compact;
}

export async function createAssistantTurn(input: {
  adminId: string;
  threadId?: string;
  clientTurnId: string;
  message: string;
  attachments?: Prisma.InputJsonValue;
  hasAttachments?: boolean;
  model: string;
}) {
  try {
    return await prisma.$transaction(
      async (tx) => {
      let thread = input.threadId
        ? await tx.assistantThread.findFirst({
            where: {
              id: input.threadId,
              adminId: input.adminId,
              archivedAt: null,
            },
          })
        : null;

      if (input.threadId && !thread) {
        throw new Error("Assistant thread not found");
      }

      if (!thread) {
        thread = await tx.assistantThread.create({
          data: {
            adminId: input.adminId,
            title: threadTitle(
              input.message || (input.hasAttachments ? "Attachment review" : ""),
            ),
          },
        });
      }

      const duplicate = await tx.assistantRun.findUnique({
        where: {
          threadId_clientTurnId: {
            threadId: thread.id,
            clientTurnId: input.clientTurnId,
          },
        },
        include: { messages: true, toolRuns: true },
      });
      if (duplicate) return { thread, run: duplicate, duplicate: true };

      const activeRun = await tx.assistantRun.findFirst({
        where: {
          threadId: thread.id,
          status: { in: ACTIVE_RUN_STATUSES },
        },
        select: { id: true },
      });
      if (activeRun) {
        throw new Error("This conversation already has an active request");
      }

      const run = await tx.assistantRun.create({
        data: {
          threadId: thread.id,
          clientTurnId: input.clientTurnId,
          model: input.model,
          hasAttachments: Boolean(input.hasAttachments),
          messages: {
            create: {
              threadId: thread.id,
              role: "USER",
              content: input.message,
              attachments: input.attachments,
            },
          },
        },
        include: { messages: true, toolRuns: true },
      });

      await tx.assistantThread.update({
        where: { id: thread.id },
        data: { updatedAt: new Date() },
      });

      return { thread, run, duplicate: false };
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2034"
    ) {
      throw new Error("This conversation already has an active request");
    }
    throw error;
  }
}

export async function createOrGetAssistantToolRun(input: {
  runId: string;
  callId: string;
  namespace: string;
  toolName: string;
  arguments: Prisma.InputJsonValue;
  requiresConfirmation: boolean;
  preview?: Prisma.InputJsonValue;
  expiresAt?: Date;
}) {
  return prisma.assistantToolRun.upsert({
    where: { runId_callId: { runId: input.runId, callId: input.callId } },
    update: {},
    create: {
      runId: input.runId,
      callId: input.callId,
      namespace: input.namespace,
      toolName: input.toolName,
      arguments: input.arguments,
      status: input.requiresConfirmation
        ? "PENDING_CONFIRMATION"
        : "RUNNING",
      requiresConfirmation: input.requiresConfirmation,
      preview: input.preview,
      expiresAt: input.expiresAt,
    },
  });
}

export async function completeAssistantToolRun(
  id: string,
  result: Prisma.InputJsonValue,
) {
  return prisma.assistantToolRun.update({
    where: { id },
    data: {
      status: "COMPLETED",
      result,
      error: null,
      completedAt: new Date(),
    },
  });
}

export async function failAssistantToolRun(id: string, error: string) {
  return prisma.assistantToolRun.update({
    where: { id },
    data: {
      status: "FAILED",
      error,
      completedAt: new Date(),
    },
  });
}

export async function pauseAssistantRun(
  runId: string,
  resumeInput: Prisma.InputJsonValue,
) {
  return prisma.assistantRun.update({
    where: { id: runId },
    data: { status: "WAITING_CONFIRMATION", resumeInput },
  });
}

export async function getAssistantToolRunForDecision(
  adminId: string,
  toolRunId: string,
) {
  return prisma.assistantToolRun.findFirst({
    where: {
      id: toolRunId,
      run: { thread: { adminId } },
    },
    include: {
      run: {
        include: {
          thread: true,
        },
      },
    },
  });
}

export async function claimAssistantToolRun(input: {
  adminId: string;
  toolRunId: string;
}) {
  const outcome = await prisma.$transaction(async (tx) => {
    const now = new Date();
    const claimed = await tx.assistantToolRun.updateMany({
      where: {
        id: input.toolRunId,
        status: "PENDING_CONFIRMATION",
        expiresAt: { gt: now },
        run: {
          status: "WAITING_CONFIRMATION",
          thread: { adminId: input.adminId },
        },
      },
      data: {
        status: "RUNNING",
        confirmedById: input.adminId,
        confirmedAt: now,
      },
    });
    if (claimed.count !== 1) {
      const expired = await tx.assistantToolRun.findFirst({
        where: {
          id: input.toolRunId,
          status: "PENDING_CONFIRMATION",
          expiresAt: { lte: now },
          run: {
            status: "WAITING_CONFIRMATION",
            thread: { adminId: input.adminId },
          },
        },
        select: { id: true, runId: true },
      });
      if (expired) {
        await tx.assistantToolRun.updateMany({
          where: { id: expired.id, status: "PENDING_CONFIRMATION" },
          data: { status: "EXPIRED", completedAt: now },
        });
        await tx.assistantRun.updateMany({
          where: { id: expired.runId, status: "WAITING_CONFIRMATION" },
          data: {
            status: "FAILED",
            error: "Confirmation expired",
            resumeInput: Prisma.JsonNull,
            completedAt: now,
          },
        });
        return { status: "expired" as const };
      }
      throw new Error("Confirmation is no longer available");
    }

    const toolRun = await tx.assistantToolRun.findUniqueOrThrow({
      where: { id: input.toolRunId },
      include: { run: true },
    });
    await tx.assistantRun.update({
      where: { id: toolRun.runId },
      data: { status: "RUNNING" },
    });
    return { status: "claimed" as const, toolRun };
  });
  if (outcome.status === "expired") throw new Error("Confirmation expired");
  return outcome.toolRun;
}

export async function rejectAssistantToolRun(input: {
  adminId: string;
  toolRunId: string;
}) {
  const outcome = await prisma.$transaction(async (tx) => {
    const now = new Date();
    const rejected = await tx.assistantToolRun.updateMany({
      where: {
        id: input.toolRunId,
        status: "PENDING_CONFIRMATION",
        expiresAt: { gt: now },
        run: {
          status: "WAITING_CONFIRMATION",
          thread: { adminId: input.adminId },
        },
      },
      data: {
        status: "REJECTED",
        confirmedById: input.adminId,
        confirmedAt: now,
        completedAt: now,
        result: { status: "rejected_by_user" },
      },
    });
    if (rejected.count !== 1) {
      const expired = await tx.assistantToolRun.findFirst({
        where: {
          id: input.toolRunId,
          status: "PENDING_CONFIRMATION",
          expiresAt: { lte: now },
          run: {
            status: "WAITING_CONFIRMATION",
            thread: { adminId: input.adminId },
          },
        },
        select: { id: true, runId: true },
      });
      if (expired) {
        await tx.assistantToolRun.updateMany({
          where: { id: expired.id, status: "PENDING_CONFIRMATION" },
          data: { status: "EXPIRED", completedAt: now },
        });
        await tx.assistantRun.updateMany({
          where: { id: expired.runId, status: "WAITING_CONFIRMATION" },
          data: {
            status: "FAILED",
            error: "Confirmation expired",
            resumeInput: Prisma.JsonNull,
            completedAt: now,
          },
        });
        return { status: "expired" as const };
      }
      throw new Error("Confirmation is no longer available");
    }
    const toolRun = await tx.assistantToolRun.findUniqueOrThrow({
      where: { id: input.toolRunId },
      include: { run: true },
    });
    await tx.assistantRun.update({
      where: { id: toolRun.runId },
      data: { status: "RUNNING" },
    });
    return { status: "rejected" as const, toolRun };
  });
  if (outcome.status === "expired") throw new Error("Confirmation expired");
  return outcome.toolRun;
}

export async function completeAssistantRun(input: {
  runId: string;
  threadId: string;
  content: string;
  usage?: {
    inputTokens: number;
    outputTokens: number;
    reasoningTokens: number;
    cachedInputTokens: number;
    cacheWriteTokens: number;
  };
}) {
  return prisma.$transaction(async (tx) => {
    const message = await tx.assistantMessage.create({
      data: {
        threadId: input.threadId,
        runId: input.runId,
        role: "ASSISTANT",
        content: input.content,
      },
    });
    await tx.assistantRun.update({
      where: { id: input.runId },
      data: {
        status: "COMPLETED",
        resumeInput: Prisma.JsonNull,
        completedAt: new Date(),
        inputTokens: input.usage?.inputTokens,
        outputTokens: input.usage?.outputTokens,
        reasoningTokens: input.usage?.reasoningTokens,
        cachedInputTokens: input.usage?.cachedInputTokens,
        cacheWriteTokens: input.usage?.cacheWriteTokens,
      },
    });
    await tx.assistantThread.update({
      where: { id: input.threadId },
      data: { updatedAt: new Date() },
    });
    return message;
  });
}

export async function failAssistantRun(runId: string, error: string) {
  return prisma.assistantRun.update({
    where: { id: runId },
    data: {
      status: "FAILED",
      error,
      resumeInput: Prisma.JsonNull,
      completedAt: new Date(),
    },
  });
}

export async function archiveAssistantThread(
  adminId: string,
  threadId: string,
  archived: boolean,
) {
  const result = await prisma.assistantThread.updateMany({
    where: { id: threadId, adminId },
    data: { archivedAt: archived ? new Date() : null },
  });
  if (result.count !== 1) throw new Error("Assistant thread not found");
}

export async function getAssistantRun(adminId: string, runId: string) {
  return prisma.assistantRun.findFirst({
    where: { id: runId, thread: { adminId } },
    include: { thread: true, toolRuns: true },
  });
}

export function assistantMessageRoleToApi(role: AssistantMessageRole) {
  return role === "USER" ? "user" as const : "assistant" as const;
}

export function isTerminalToolRunStatus(status: AssistantToolRunStatus) {
  return ["COMPLETED", "FAILED", "REJECTED", "EXPIRED"].includes(status);
}
