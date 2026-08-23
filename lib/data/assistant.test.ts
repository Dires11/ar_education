import { beforeEach, describe, expect, it, vi } from "vitest";

const prismaMock = vi.hoisted(() => ({
  assistantThread: {
    updateMany: vi.fn(),
    findFirst: vi.fn(),
  },
  assistantToolRun: {
    upsert: vi.fn(),
  },
  $transaction: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }));

import {
  archiveAssistantThread,
  claimAssistantToolRun,
  createAssistantTurn,
  createOrGetAssistantToolRun,
  expireAssistantRuns,
  failAssistantRun,
  getAssistantContext,
  getAssistantThreadMessageCount,
  recordAssistantModelStep,
  rejectAssistantToolRun,
} from "@/lib/data/assistant";

describe("assistant persistence guarantees", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("uses one atomic upsert per OpenAI call ID", async () => {
    prismaMock.assistantToolRun.upsert.mockResolvedValue({ id: "tool-1" });

    await createOrGetAssistantToolRun({
      runId: "run-1",
      callId: "call-1",
      namespace: "catalog",
      toolName: "create_subject",
      arguments: { name: "Algebra" },
      requiresConfirmation: false,
    });

    expect(prismaMock.assistantToolRun.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          runId_callId: { runId: "run-1", callId: "call-1" },
        },
        update: {},
      }),
    );
  });

  it("scopes authoritative thread message counts to the administrator", async () => {
    prismaMock.assistantThread.findFirst.mockResolvedValue({
      _count: { messages: 7 },
    });

    await expect(
      getAssistantThreadMessageCount("admin-1", "thread-1"),
    ).resolves.toBe(7);
    expect(prismaMock.assistantThread.findFirst).toHaveBeenCalledWith({
      where: { id: "thread-1", adminId: "admin-1" },
      select: {
        _count: {
          select: {
            messages: {
              where: {
                OR: [{ runId: null }, { run: { supersededAt: null } }],
              },
            },
          },
        },
      },
    });
  });

  it("carries attachment provenance into later turns", async () => {
    prismaMock.assistantThread.findFirst.mockResolvedValue({
      contextSummary: null,
      _count: { runs: 1 },
      messages: [
        {
          role: "ASSISTANT",
          content: "I found the requested record.",
          attachments: null,
          createdAt: new Date(),
          run: { _count: { toolRuns: 1 } },
        },
        {
          role: "USER",
          content: "Use this calendar.",
          attachments: [{ name: "calendar.jpg" }],
          createdAt: new Date(),
          run: { _count: { toolRuns: 0 } },
        },
      ],
    });

    const context = await getAssistantContext("admin-1", "thread-1");

    expect(context?.hasUntrustedHistory).toBe(true);
    expect(context?.messages).toEqual(
      expect.arrayContaining([
        expect.not.objectContaining({ run: expect.anything() }),
      ]),
    );
    expect(prismaMock.assistantThread.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "thread-1", adminId: "admin-1" },
      }),
    );
  });

  it("retains attachment provenance when only the assistant reply remains in the context window", async () => {
    prismaMock.assistantThread.findFirst.mockResolvedValue({
      contextSummary: null,
      _count: { runs: 1 },
      messages: [
        {
          role: "ASSISTANT",
          content: "I extracted the calendar.",
          attachments: null,
          createdAt: new Date(),
          run: { hasAttachments: true, _count: { toolRuns: 0 } },
        },
      ],
    });

    await expect(
      getAssistantContext("admin-1", "thread-1", 1),
    ).resolves.toMatchObject({ hasUntrustedHistory: true });
  });

  it("does not classify ordinary CRM tool history as attachment-derived", async () => {
    prismaMock.assistantThread.findFirst.mockResolvedValue({
      contextSummary: "A student lookup was completed.",
      _count: { runs: 0 },
      messages: [
        {
          role: "ASSISTANT",
          content: "I found the requested record.",
          attachments: null,
          createdAt: new Date(),
          run: { hasAttachments: false, _count: { toolRuns: 1 } },
        },
      ],
    });

    await expect(
      getAssistantContext("admin-1", "thread-1"),
    ).resolves.toMatchObject({ hasUntrustedHistory: false });
  });

  it("checks active runs inside a serializable transaction", async () => {
    const tx = {
      assistantThread: {
        findFirst: vi.fn().mockResolvedValue({ id: "thread-1" }),
      },
      assistantRun: {
        findUnique: vi.fn().mockResolvedValue(null),
        findFirst: vi.fn().mockResolvedValue({ id: "active-run" }),
        findMany: vi.fn().mockResolvedValue([]),
      },
      assistantToolRun: {
        findMany: vi.fn().mockResolvedValue([]),
        updateMany: vi.fn(),
      },
    };
    prismaMock.$transaction.mockImplementation(
      (
        callback: (client: typeof tx) => unknown,
        options: { isolationLevel: string },
      ) => {
        expect(options.isolationLevel).toBe("Serializable");
        return callback(tx);
      },
    );

    await expect(
      createAssistantTurn({
        adminId: "admin-1",
        threadId: "thread-1",
        clientTurnId: "turn-2",
        message: "Another request",
        model: "gpt-5.6-luna",
      }),
    ).rejects.toThrow("already has an active request");

    expect(prismaMock.$transaction).toHaveBeenCalledWith(expect.any(Function), {
      isolationLevel: "Serializable",
    });
  });

  it("restarts a failed client turn only when it never reached a tool", async () => {
    const thread = {
      id: "thread-1",
      adminId: "admin-1",
      archivedAt: null,
    };
    const failedRun = {
      id: "run-1",
      threadId: thread.id,
      status: "FAILED",
      thread,
      messages: [{ id: "message-1", role: "USER" }],
      toolRuns: [],
    };
    const restartedRun = { ...failedRun, status: "RUNNING" };
    const tx = {
      assistantMessage: {
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
        count: vi.fn().mockResolvedValue(1),
      },
      assistantRun: {
        findUnique: vi.fn().mockResolvedValue(failedRun),
        findUniqueOrThrow: vi.fn().mockResolvedValue(failedRun),
        findMany: vi.fn().mockResolvedValue([]),
        update: vi.fn().mockResolvedValue(restartedRun),
        updateMany: vi.fn(),
      },
      assistantToolRun: {
        findMany: vi.fn().mockResolvedValue([]),
        updateMany: vi.fn(),
      },
    };
    prismaMock.$transaction.mockImplementation(
      (
        callback: (client: typeof tx) => unknown,
        options: { isolationLevel: string },
      ) => {
        expect(options.isolationLevel).toBe("Serializable");
        return callback(tx);
      },
    );

    await expect(
      createAssistantTurn({
        adminId: "admin-1",
        clientTurnId: "turn-1",
        message: "Retry this request",
        model: "gpt-5.6-luna",
      }),
    ).resolves.toEqual({
      thread,
      run: restartedRun,
      duplicate: false,
      messageCount: 1,
    });

    expect(tx.assistantRun.update).toHaveBeenCalledWith({
      where: { id: "run-1" },
      data: {
        status: "RUNNING",
        error: null,
        hasAttachments: false,
        toolCallCount: 0,
        completedAt: null,
      },
      include: {
        thread: true,
        messages: true,
        toolRuns: true,
      },
    });
    expect(tx.assistantMessage.updateMany).toHaveBeenCalledWith({
      where: { runId: "run-1", role: "USER" },
      data: {
        content: "Retry this request",
        attachments: expect.anything(),
      },
    });
  });

  it("atomically records retry lineage and hides the superseded run", async () => {
    const thread = {
      id: "thread-1",
      adminId: "admin-1",
      archivedAt: null,
    };
    const run = {
      id: "run-new",
      threadId: thread.id,
      status: "RUNNING",
      messages: [],
      toolRuns: [],
    };
    const tx = {
      assistantThread: {
        findFirst: vi.fn().mockResolvedValue(thread),
        update: vi.fn().mockResolvedValue(thread),
      },
      assistantMessage: { count: vi.fn().mockResolvedValue(1) },
      assistantRun: {
        findUnique: vi.fn().mockResolvedValue(null),
        findFirst: vi.fn().mockResolvedValue(null),
        findMany: vi.fn().mockResolvedValue([]),
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
        create: vi.fn().mockResolvedValue(run),
      },
      assistantToolRun: {
        findMany: vi.fn().mockResolvedValue([]),
        updateMany: vi.fn().mockResolvedValue({ count: 0 }),
      },
    };
    prismaMock.$transaction.mockImplementation(
      (callback: (client: typeof tx) => unknown) => callback(tx),
    );

    await createAssistantTurn({
      adminId: "admin-1",
      threadId: "thread-1",
      clientTurnId: "turn-new",
      message: "Edited request",
      supersedesRunId: "run-old",
      model: "gpt-5.6-luna",
    });

    expect(tx.assistantRun.updateMany).toHaveBeenCalledWith({
      where: {
        id: "run-old",
        threadId: "thread-1",
        status: "FAILED",
        supersededAt: null,
        thread: { adminId: "admin-1", archivedAt: null },
      },
      data: { supersededAt: expect.any(Date) },
    });
    expect(tx.assistantRun.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ supersedesRunId: "run-old" }),
      }),
    );
    expect(tx.assistantThread.update).toHaveBeenCalledWith({
      where: { id: "thread-1" },
      data: {
        updatedAt: expect.any(Date),
        contextSummary: null,
        summarizedMessageCount: 0,
      },
    });
    expect(tx.assistantMessage.count).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          OR: [{ runId: null }, { run: { supersededAt: null } }],
        }),
      }),
    );
  });

  it("atomically claims a pending, unexpired confirmation", async () => {
    const toolRun = { id: "tool-1", runId: "run-1", status: "RUNNING" };
    const tx = {
      assistantToolRun: {
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
        findFirst: vi.fn(),
        findUniqueOrThrow: vi.fn().mockResolvedValue(toolRun),
      },
      assistantRun: {
        update: vi.fn().mockResolvedValue({}),
        updateMany: vi.fn(),
      },
    };
    prismaMock.$transaction.mockImplementation(
      (callback: (client: typeof tx) => unknown) => callback(tx),
    );

    await expect(
      claimAssistantToolRun({
        adminId: "admin-1",
        toolRunId: "tool-1",
      }),
    ).resolves.toEqual(toolRun);

    expect(tx.assistantToolRun.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          id: "tool-1",
          status: "PENDING_CONFIRMATION",
          expiresAt: { gt: expect.any(Date) },
        }),
        data: expect.objectContaining({
          status: "RUNNING",
          confirmedById: "admin-1",
        }),
      }),
    );
  });

  it("persists confirmation expiry before returning an error", async () => {
    const tx = {
      assistantToolRun: {
        updateMany: vi
          .fn()
          .mockResolvedValueOnce({ count: 0 })
          .mockResolvedValueOnce({ count: 1 }),
        findFirst: vi.fn().mockResolvedValue({ id: "tool-1", runId: "run-1" }),
        findUniqueOrThrow: vi.fn(),
      },
      assistantRun: {
        update: vi.fn(),
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
      },
    };
    prismaMock.$transaction.mockImplementation(
      async (callback: (client: typeof tx) => unknown) => callback(tx),
    );

    await expect(
      claimAssistantToolRun({
        adminId: "admin-1",
        toolRunId: "tool-1",
      }),
    ).rejects.toThrow("Confirmation expired");

    expect(tx.assistantToolRun.updateMany).toHaveBeenLastCalledWith({
      where: { id: "tool-1", status: "PENDING_CONFIRMATION" },
      data: { status: "EXPIRED", completedAt: expect.any(Date) },
    });
    expect(tx.assistantRun.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: "FAILED",
          error: "Confirmation expired",
        }),
      }),
    );
  });

  it("does not reject a confirmation that another request already claimed", async () => {
    const tx = {
      assistantToolRun: {
        updateMany: vi.fn().mockResolvedValue({ count: 0 }),
        findFirst: vi.fn().mockResolvedValue(null),
        findUniqueOrThrow: vi.fn(),
      },
      assistantRun: {
        update: vi.fn(),
        updateMany: vi.fn(),
      },
    };
    prismaMock.$transaction.mockImplementation(
      async (callback: (client: typeof tx) => unknown) => callback(tx),
    );

    await expect(
      rejectAssistantToolRun({
        adminId: "admin-1",
        toolRunId: "tool-1",
      }),
    ).rejects.toThrow("Confirmation is no longer available");

    expect(tx.assistantToolRun.findUniqueOrThrow).not.toHaveBeenCalled();
    expect(tx.assistantRun.update).not.toHaveBeenCalled();
  });

  it("expires interrupted runs so a thread can accept another turn", async () => {
    const tx = {
      assistantToolRun: {
        findMany: vi.fn().mockResolvedValue([]),
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
      },
      assistantRun: {
        findMany: vi.fn().mockResolvedValue([
          {
            id: "stale-run",
            toolRuns: [{ id: "tool-1", status: "RUNNING" }],
          },
        ]),
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
      },
    };
    prismaMock.$transaction.mockImplementation(
      (callback: (client: typeof tx) => unknown) => callback(tx),
    );

    await expireAssistantRuns("admin-1", "thread-1");

    expect(tx.assistantToolRun.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          status: "RUNNING",
          run: {
            status: "FAILED",
            thread: { adminId: "admin-1", id: "thread-1" },
          },
        },
        data: expect.objectContaining({ status: "UNKNOWN" }),
      }),
    );
    expect(tx.assistantToolRun.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          status: "PENDING_CONFIRMATION",
          run: {
            status: "FAILED",
            thread: { adminId: "admin-1", id: "thread-1" },
          },
        },
        data: expect.objectContaining({ status: "FAILED" }),
      }),
    );
    expect(tx.assistantRun.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          status: "RUNNING",
          updatedAt: { lte: expect.any(Date) },
          thread: { adminId: "admin-1", id: "thread-1" },
        }),
      }),
    );
    expect(tx.assistantRun.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: { in: ["stale-run"] }, status: "RUNNING" },
        data: expect.objectContaining({
          status: "FAILED",
          error: expect.stringContaining("may have completed"),
        }),
      }),
    );
    expect(tx.assistantToolRun.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: { in: ["tool-1"] }, status: "RUNNING" },
        data: expect.objectContaining({ status: "UNKNOWN" }),
      }),
    );
  });

  it("marks an unfinalized running tool unknown when its parent run fails", async () => {
    const tx = {
      assistantToolRun: {
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
      },
      assistantRun: {
        update: vi.fn().mockResolvedValue({ id: "run-1", status: "FAILED" }),
      },
    };
    prismaMock.$transaction.mockImplementation(
      (callback: (client: typeof tx) => unknown) => callback(tx),
    );

    await failAssistantRun("run-1", "Audit finalization failed");

    expect(tx.assistantToolRun.updateMany).toHaveBeenCalledWith({
      where: { runId: "run-1", status: "RUNNING" },
      data: expect.objectContaining({
        status: "UNKNOWN",
        error: expect.stringContaining("Verify the CRM state"),
      }),
    });
    expect(tx.assistantToolRun.updateMany).toHaveBeenCalledWith({
      where: { runId: "run-1", status: "PENDING_CONFIRMATION" },
      data: expect.objectContaining({
        status: "FAILED",
        error: expect.stringContaining("could not be activated"),
      }),
    });
    expect(tx.assistantRun.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "run-1" },
        data: expect.objectContaining({ status: "FAILED" }),
      }),
    );
  });

  it("refuses to archive a thread with an active run or pending approval", async () => {
    prismaMock.assistantThread.updateMany.mockResolvedValue({ count: 0 });
    prismaMock.assistantThread.findFirst.mockResolvedValue({
      id: "thread-1",
      archivedAt: null,
      runs: [{ id: "run-1" }],
    });

    await expect(
      archiveAssistantThread("admin-1", "thread-1", true),
    ).rejects.toThrow("active request or pending approval");

    expect(prismaMock.assistantThread.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          id: "thread-1",
          adminId: "admin-1",
          runs: {
            none: { status: { in: ["RUNNING", "WAITING_CONFIRMATION"] } },
          },
        }),
      }),
    );
  });

  it("persists run-wide usage and refuses a thirteenth tool call", async () => {
    const tx = {
      assistantRun: {
        findUniqueOrThrow: vi.fn().mockResolvedValue({
          toolCallCount: 12,
          inputTokens: 100,
          outputTokens: 20,
          reasoningTokens: 5,
          cachedInputTokens: 10,
          cacheWriteTokens: 0,
        }),
        update: vi.fn().mockResolvedValue({}),
      },
    };
    prismaMock.$transaction.mockImplementation(
      (callback: (client: typeof tx) => unknown) => callback(tx),
    );

    await expect(
      recordAssistantModelStep({
        runId: "run-1",
        hasToolCall: true,
        maxToolCalls: 12,
        usage: {
          inputTokens: 10,
          outputTokens: 4,
          reasoningTokens: 1,
          cachedInputTokens: 2,
          cacheWriteTokens: 0,
        },
      }),
    ).resolves.toEqual({
      toolCallAllowed: false,
      toolCallCount: 12,
    });
    expect(tx.assistantRun.update).toHaveBeenCalledWith({
      where: { id: "run-1" },
      data: {
        inputTokens: 110,
        outputTokens: 24,
        reasoningTokens: 6,
        cachedInputTokens: 12,
        cacheWriteTokens: 0,
      },
    });
  });
});
