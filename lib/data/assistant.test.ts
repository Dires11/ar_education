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
});
