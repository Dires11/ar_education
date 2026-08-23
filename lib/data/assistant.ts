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
// Keep this above the route's five-minute execution window so a legitimate
// long-running response cannot be reclaimed by a second browser tab.
export const ASSISTANT_RUN_STALE_AFTER_MS = 6 * 60 * 1000;

async function expireAssistantRunsInTransaction(
  tx: Prisma.TransactionClient,
  input: {
    adminId: string;
    threadId?: string;
    now: Date;
  },
) {
  const threadWhere = {
    adminId: input.adminId,
    ...(input.threadId ? { id: input.threadId } : {}),
  };
  const expiredConfirmations = await tx.assistantToolRun.findMany({
    where: {
      status: "PENDING_CONFIRMATION",
      expiresAt: { lte: input.now },
      run: {
        status: "WAITING_CONFIRMATION",
        thread: threadWhere,
      },
    },
    select: { id: true, runId: true },
  });
  if (expiredConfirmations.length > 0) {
    const toolRunIds = expiredConfirmations.map((toolRun) => toolRun.id);
    const runIds = [
      ...new Set(expiredConfirmations.map((toolRun) => toolRun.runId)),
    ];
    await tx.assistantToolRun.updateMany({
      where: { id: { in: toolRunIds }, status: "PENDING_CONFIRMATION" },
      data: {
        status: "EXPIRED",
        error: "Confirmation expired",
        completedAt: input.now,
      },
    });
    await tx.assistantRun.updateMany({
      where: { id: { in: runIds }, status: "WAITING_CONFIRMATION" },
      data: {
        status: "FAILED",
        error: "Confirmation expired",
        resumeInput: Prisma.JsonNull,
        completedAt: input.now,
      },
    });
  }

  // A run can be marked failed after its CRM mutation succeeds but before the
  // tool audit result is finalized. Recover those child rows immediately on
  // the next page load instead of leaving them RUNNING forever.
  await tx.assistantToolRun.updateMany({
    where: {
      status: "RUNNING",
      run: {
        status: "FAILED",
        thread: threadWhere,
      },
    },
    data: {
      status: "UNKNOWN",
      error:
        "Execution finished without a durable audit result. Verify the CRM state before repeating this action.",
      completedAt: input.now,
    },
  });

  const staleBefore = new Date(
    input.now.getTime() - ASSISTANT_RUN_STALE_AFTER_MS,
  );
  const staleRuns = await tx.assistantRun.findMany({
    where: {
      status: "RUNNING",
      updatedAt: { lte: staleBefore },
      thread: threadWhere,
    },
    select: {
      id: true,
      toolRuns: { select: { id: true, status: true } },
    },
  });
  if (staleRuns.length > 0) {
    const runIds = staleRuns.map((run) => run.id);
    const unknownToolRunIds = staleRuns.flatMap((run) =>
      run.toolRuns
        .filter((toolRun) => toolRun.status === "RUNNING")
        .map((toolRun) => toolRun.id),
    );
    if (unknownToolRunIds.length > 0) {
      await tx.assistantToolRun.updateMany({
        where: { id: { in: unknownToolRunIds }, status: "RUNNING" },
        data: {
          status: "UNKNOWN",
          error:
            "Execution was interrupted before the result was recorded. Verify the CRM state before repeating this action.",
          completedAt: input.now,
        },
      });
    }

    const uncertainRunIds = staleRuns
      .filter((run) =>
        run.toolRuns.some((toolRun) => toolRun.status === "RUNNING"),
      )
      .map((run) => run.id);
    const completedRunIds = staleRuns
      .filter(
        (run) =>
          !uncertainRunIds.includes(run.id) &&
          run.toolRuns.some((toolRun) => toolRun.status === "COMPLETED"),
      )
      .map((run) => run.id);
    const interruptedBeforeWriteIds = runIds.filter(
      (id) => !uncertainRunIds.includes(id) && !completedRunIds.includes(id),
    );

    const finishRuns = (ids: string[], error: string) =>
      ids.length === 0
        ? Promise.resolve()
        : tx.assistantRun.updateMany({
            where: { id: { in: ids }, status: "RUNNING" },
            data: {
              status: "FAILED",
              error,
              resumeInput: Prisma.JsonNull,
              completedAt: input.now,
            },
          });
    await finishRuns(
      uncertainRunIds,
      "A CRM operation may have completed before the assistant was interrupted. Verify the affected records before repeating it.",
    );
    await finishRuns(
      completedRunIds,
      "CRM operations completed, but the assistant response was interrupted. Review the recorded results before continuing.",
    );
    await finishRuns(
      interruptedBeforeWriteIds,
      "Assistant response was interrupted before any CRM operation completed. It is safe to retry.",
    );
  }

  // Run this after stale parents are finalized as well as for parents that
  // failed earlier, so the first reload always removes dead approval controls.
  await tx.assistantToolRun.updateMany({
    where: {
      status: "PENDING_CONFIRMATION",
      run: {
        status: "FAILED",
        thread: threadWhere,
      },
    },
    data: {
      status: "FAILED",
      error: "Confirmation could not be activated. Start the request again.",
      completedAt: input.now,
    },
  });
}

export function expireAssistantRuns(adminId: string, threadId?: string) {
  return prisma.$transaction((tx) =>
    expireAssistantRunsInTransaction(tx, {
      adminId,
      threadId,
      now: new Date(),
    }),
  );
}

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
              clientTurnId: true,
              status: true,
              hasAttachments: true,
              error: true,
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
      _count: {
        select: { runs: { where: { hasAttachments: true } } },
      },
      messages: {
        orderBy: { createdAt: "desc" },
        take,
        select: {
          role: true,
          content: true,
          attachments: true,
          createdAt: true,
          run: {
            select: {
              hasAttachments: true,
              _count: { select: { toolRuns: true } },
            },
          },
        },
      },
    },
  });
  if (!thread) return null;
  const orderedMessages = thread.messages.reverse();
  return {
    summary: thread.contextSummary,
    hasUntrustedHistory:
      thread._count.runs > 0 ||
      orderedMessages.some(
        (message) =>
          (Array.isArray(message.attachments) &&
            message.attachments.length > 0) ||
          Boolean(message.run?.hasAttachments),
      ),
    messages: orderedMessages.map((message) => ({
      role: message.role,
      content: message.content,
      attachments: message.attachments,
      createdAt: message.createdAt,
    })),
  };
}

export async function getAssistantThreadMessageCount(
  adminId: string,
  threadId: string,
) {
  const thread = await prisma.assistantThread.findFirst({
    where: { id: threadId, adminId },
    select: { _count: { select: { messages: true } } },
  });
  if (!thread) throw new Error("Assistant thread not found");
  return thread._count.messages;
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
        const duplicate = await tx.assistantRun.findUnique({
          where: { clientTurnId: input.clientTurnId },
          include: {
            thread: true,
            messages: true,
            toolRuns: true,
          },
        });
        if (duplicate) {
          if (
            duplicate.thread.adminId !== input.adminId ||
            duplicate.thread.archivedAt
          ) {
            throw new Error("Assistant request identifier is unavailable");
          }
          await expireAssistantRunsInTransaction(tx, {
            adminId: input.adminId,
            threadId: duplicate.threadId,
            now: new Date(),
          });
          const refreshed = await tx.assistantRun.findUniqueOrThrow({
            where: { id: duplicate.id },
            include: {
              thread: true,
              messages: true,
              toolRuns: true,
            },
          });
          if (
            refreshed.status === "FAILED" &&
            refreshed.toolRuns.length === 0
          ) {
            await tx.assistantMessage.updateMany({
              where: { runId: refreshed.id, role: "USER" },
              data: {
                content: input.message,
                attachments: input.attachments ?? Prisma.JsonNull,
              },
            });
            const restarted = await tx.assistantRun.update({
              where: { id: refreshed.id },
              data: {
                status: "RUNNING",
                error: null,
                hasAttachments: Boolean(input.hasAttachments),
                toolCallCount: 0,
                completedAt: null,
              },
              include: {
                thread: true,
                messages: true,
                toolRuns: true,
              },
            });
            return {
              thread: restarted.thread,
              run: restarted,
              duplicate: false,
              messageCount: await tx.assistantMessage.count({
                where: { threadId: restarted.threadId },
              }),
            };
          }
          return {
            thread: refreshed.thread,
            run: refreshed,
            duplicate: true,
            messageCount: await tx.assistantMessage.count({
              where: { threadId: refreshed.threadId },
            }),
          };
        }

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
                input.message ||
                  (input.hasAttachments ? "Attachment review" : ""),
              ),
            },
          });
        }

        await expireAssistantRunsInTransaction(tx, {
          adminId: input.adminId,
          threadId: thread.id,
          now: new Date(),
        });

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

        return {
          thread,
          run,
          duplicate: false,
          messageCount: await tx.assistantMessage.count({
            where: { threadId: thread.id },
          }),
        };
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
    update: input.preview ? { preview: input.preview } : {},
    create: {
      runId: input.runId,
      callId: input.callId,
      namespace: input.namespace,
      toolName: input.toolName,
      arguments: input.arguments,
      status: input.requiresConfirmation ? "PENDING_CONFIRMATION" : "RUNNING",
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

export function touchAssistantRun(runId: string) {
  return prisma.assistantRun.update({
    where: { id: runId },
    data: { updatedAt: new Date() },
  });
}

export function recordAssistantModelStep(input: {
  runId: string;
  hasToolCall: boolean;
  maxToolCalls: number;
  usage?: {
    inputTokens: number;
    outputTokens: number;
    reasoningTokens: number;
    cachedInputTokens: number;
    cacheWriteTokens: number;
  };
}) {
  return prisma.$transaction(async (tx) => {
    const run = await tx.assistantRun.findUniqueOrThrow({
      where: { id: input.runId },
      select: {
        toolCallCount: true,
        inputTokens: true,
        outputTokens: true,
        reasoningTokens: true,
        cachedInputTokens: true,
        cacheWriteTokens: true,
      },
    });
    const usage = input.usage;
    const toolCallAllowed =
      !input.hasToolCall || run.toolCallCount < input.maxToolCalls;
    await tx.assistantRun.update({
      where: { id: input.runId },
      data: {
        inputTokens: (run.inputTokens ?? 0) + (usage?.inputTokens ?? 0),
        outputTokens: (run.outputTokens ?? 0) + (usage?.outputTokens ?? 0),
        reasoningTokens:
          (run.reasoningTokens ?? 0) + (usage?.reasoningTokens ?? 0),
        cachedInputTokens:
          (run.cachedInputTokens ?? 0) + (usage?.cachedInputTokens ?? 0),
        cacheWriteTokens:
          (run.cacheWriteTokens ?? 0) + (usage?.cacheWriteTokens ?? 0),
        ...(input.hasToolCall && toolCallAllowed
          ? { toolCallCount: { increment: 1 } }
          : {}),
      },
    });
    return {
      toolCallAllowed,
      toolCallCount:
        run.toolCallCount + (input.hasToolCall && toolCallAllowed ? 1 : 0),
    };
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

export async function markAssistantToolRunUnknown(id: string, error: string) {
  return prisma.assistantToolRun.update({
    where: { id },
    data: {
      status: "UNKNOWN",
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
          messages: true,
          toolRuns: { orderBy: { createdAt: "asc" } },
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
      },
    });
    const thread = await tx.assistantThread.update({
      where: { id: input.threadId },
      data: { updatedAt: new Date() },
      select: { _count: { select: { messages: true } } },
    });
    return { message, messageCount: thread._count.messages };
  });
}

export async function failAssistantRun(runId: string, error: string) {
  return prisma.$transaction(async (tx) => {
    const now = new Date();
    await tx.assistantToolRun.updateMany({
      where: { runId, status: "RUNNING" },
      data: {
        status: "UNKNOWN",
        error:
          "Execution finished without a durable audit result. Verify the CRM state before repeating this action.",
        completedAt: now,
      },
    });
    await tx.assistantToolRun.updateMany({
      where: { runId, status: "PENDING_CONFIRMATION" },
      data: {
        status: "FAILED",
        error: "Confirmation could not be activated. Start the request again.",
        completedAt: now,
      },
    });
    return tx.assistantRun.update({
      where: { id: runId },
      data: {
        status: "FAILED",
        error,
        resumeInput: Prisma.JsonNull,
        completedAt: now,
      },
    });
  });
}

export async function archiveAssistantThread(
  adminId: string,
  threadId: string,
  archived: boolean,
) {
  if (!archived) {
    const restored = await prisma.assistantThread.updateMany({
      where: { id: threadId, adminId },
      data: { archivedAt: null },
    });
    if (restored.count !== 1) throw new Error("Assistant thread not found");
    return;
  }

  const result = await prisma.assistantThread.updateMany({
    where: {
      id: threadId,
      adminId,
      archivedAt: null,
      runs: {
        none: { status: { in: ACTIVE_RUN_STATUSES } },
      },
    },
    data: { archivedAt: new Date() },
  });
  if (result.count === 1) return;

  const thread = await prisma.assistantThread.findFirst({
    where: { id: threadId, adminId },
    select: {
      id: true,
      archivedAt: true,
      runs: {
        where: { status: { in: ACTIVE_RUN_STATUSES } },
        select: { id: true },
        take: 1,
      },
    },
  });
  if (!thread) throw new Error("Assistant thread not found");
  if (thread.runs.length > 0) {
    throw new Error(
      "This conversation has an active request or pending approval and cannot be archived yet",
    );
  }
}

export async function getAssistantRun(adminId: string, runId: string) {
  return prisma.assistantRun.findFirst({
    where: { id: runId, thread: { adminId } },
    include: { thread: true, toolRuns: true },
  });
}

export function assistantMessageRoleToApi(role: AssistantMessageRole) {
  return role === "USER" ? ("user" as const) : ("assistant" as const);
}

export function isTerminalToolRunStatus(status: AssistantToolRunStatus) {
  return ["COMPLETED", "FAILED", "UNKNOWN", "REJECTED", "EXPIRED"].includes(
    status,
  );
}
