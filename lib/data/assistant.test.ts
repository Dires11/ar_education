import { beforeEach, describe, expect, it, vi } from "vitest";

const prismaMock = vi.hoisted(() => ({
  assistantToolRun: {
    upsert: vi.fn(),
  },
  $transaction: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }));

import {
  claimAssistantToolRun,
  createAssistantTurn,
  createOrGetAssistantToolRun,
  expireAssistantRuns,
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

    expect(prismaMock.$transaction).toHaveBeenCalledWith(
      expect.any(Function),
      { isolationLevel: "Serializable" },
    );
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
    });

    expect(tx.assistantRun.update).toHaveBeenCalledWith({
      where: { id: "run-1" },
      data: {
        status: "RUNNING",
        error: null,
        completedAt: null,
      },
      include: {
        thread: true,
        messages: true,
        toolRuns: true,
      },
    });
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
        findFirst: vi
          .fn()
          .mockResolvedValue({ id: "tool-1", runId: "run-1" }),
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
        findMany: vi.fn().mockResolvedValue([{ id: "stale-run" }]),
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
      },
    };
    prismaMock.$transaction.mockImplementation(
      (callback: (client: typeof tx) => unknown) => callback(tx),
    );

    await expireAssistantRuns("admin-1", "thread-1");

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
        data: expect.objectContaining({ status: "FAILED" }),
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
