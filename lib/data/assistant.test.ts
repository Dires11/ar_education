import { beforeEach, describe, expect, it, vi } from "vitest";
import { Prisma } from "@/generated/prisma";

const prismaMock = vi.hoisted(() => ({
  assistantThread: {
    updateMany: vi.fn(),
    findFirst: vi.fn(),
    findMany: vi.fn(),
  },
  assistantToolRun: {
    findMany: vi.fn(),
    upsert: vi.fn(),
  },
  assistantRun: { findUnique: vi.fn() },
  assistantMessage: { findMany: vi.fn(), count: vi.fn() },
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
  getAssistantSummarySource,
  getAssistantThreadMessages,
  getAssistantThreadMessageCount,
  listAssistantThreads,
  recordAssistantModelStep,
  rejectAssistantToolRun,
  setAssistantThreadSummary,
} from "@/lib/data/assistant";

describe("assistant persistence guarantees", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    prismaMock.assistantToolRun.findMany.mockResolvedValue([]);
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

  it("bounds the initial thread rail and returns a stable continuation cursor", async () => {
    prismaMock.assistantThread.findMany.mockResolvedValue(
      Array.from({ length: 51 }, (_, index) => ({
        id: `thread-${String(index).padStart(2, "0")}`,
        title: `Thread ${index}`,
        updatedAt: new Date(Date.UTC(2026, 7, 23, 12, 0, 0) - index * 1_000),
        _count: { messages: index },
      })),
    );

    const page = await listAssistantThreads("admin-1", { limit: 50 });

    expect(page).toMatchObject({ hasMore: true });
    expect(page.threads).toHaveLength(50);
    expect(page.nextCursor?.id).toBe("thread-49");
    expect(prismaMock.assistantThread.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { adminId: "admin-1", archivedAt: null },
        orderBy: [{ updatedAt: "desc" }, { id: "desc" }],
        take: 51,
      }),
    );
  });

  it("loads only a recent message window and scopes older pages to the admin", async () => {
    prismaMock.assistantMessage.findMany.mockResolvedValue(
      Array.from({ length: 41 }, (_, index) => ({
        id: `message-${String(index).padStart(2, "0")}`,
        role: index % 2 === 0 ? "USER" : "ASSISTANT",
        content: `Message ${index}`,
        attachments: null,
        createdAt: new Date(Date.UTC(2026, 7, 23, 12, 0, 0) - index * 1_000),
        run: null,
      })),
    );

    const before = {
      createdAt: new Date("2026-08-23T13:00:00.000Z"),
      id: "message-cursor",
    };
    const page = await getAssistantThreadMessages("admin-1", "thread-1", {
      limit: 40,
      before,
    });

    expect(page.hasMore).toBe(true);
    expect(page.messages).toHaveLength(40);
    expect(page.messages[0].id).toBe("message-39");
    expect(page.nextCursor?.id).toBe("message-39");
    expect(prismaMock.assistantMessage.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          threadId: "thread-1",
          thread: { adminId: "admin-1" },
        }),
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        take: 41,
      }),
    );
  });

  it("summarizes a large backlog in bounded message batches", async () => {
    prismaMock.assistantThread.findFirst.mockResolvedValue({
      contextSummary: "Earlier summary",
      summarizedMessageCount: 0,
      _count: { messages: 200 },
    });
    prismaMock.assistantMessage.findMany.mockResolvedValue(
      Array.from({ length: 40 }, (_, index) => ({
        role: index % 2 === 0 ? "USER" : "ASSISTANT",
        content: `message-${index}`,
        run:
          index === 0
            ? {
                status: "COMPLETED",
                toolRuns: [
                  {
                    namespace: "students",
                    toolName: "create_student",
                    status: "COMPLETED",
                    result: {
                      card: { entityKey: "student:student-42" },
                    },
                  },
                  {
                    namespace: "billing",
                    toolName: "send_payment_reminder",
                    status: "COMPLETED",
                    result: {
                      card: {
                        entityKey:
                          "payment-reminder:enrollment-1:2026-08",
                      },
                    },
                  },
                ],
              }
            : null,
      })),
    );

    await expect(
      getAssistantSummarySource("admin-1", "thread-1"),
    ).resolves.toMatchObject({
      summarizeThrough: 40,
      messages: [
        expect.objectContaining({
          entityKeys: [
            "student:student-42",
            "payment-reminder:enrollment-1:2026-08",
          ],
        }),
        ...Array.from({ length: 39 }, () => expect.any(Object)),
      ],
    });
    expect(prismaMock.assistantMessage.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        skip: 0,
        take: 40,
        select: expect.objectContaining({
          run: {
            select: {
              status: true,
              toolRuns: expect.objectContaining({
                take: 12,
              }),
            },
          },
        }),
      }),
    );
  });

  it.each([
    { count: 30, summarizeThrough: null },
    { count: 31, summarizeThrough: 1 },
    { count: 40, summarizeThrough: 10 },
    { count: 41, summarizeThrough: 11 },
  ])(
    "keeps summary coverage aligned at the $count-message boundary",
    async ({ count, summarizeThrough }) => {
      prismaMock.assistantThread.findFirst.mockResolvedValue({
        contextSummary: null,
        summarizedMessageCount: 0,
        _count: { messages: count },
      });
      prismaMock.assistantMessage.findMany.mockResolvedValue([]);

      const source = await getAssistantSummarySource(
        "admin-1",
        "thread-1",
      );

      if (summarizeThrough === null) {
        expect(source).toBeNull();
        expect(prismaMock.assistantMessage.findMany).not.toHaveBeenCalled();
      } else {
        expect(source).toMatchObject({ summarizeThrough });
        expect(prismaMock.assistantMessage.findMany).toHaveBeenCalledWith(
          expect.objectContaining({
            skip: 0,
            take: summarizeThrough,
          }),
        );
      }
    },
  );

  it("keeps one in-flight user message beyond the summarized recent window", async () => {
    prismaMock.assistantThread.findFirst.mockResolvedValue({
      contextSummary: "Earlier summary",
      _count: { runs: 0 },
      messages: [],
    });

    await getAssistantContext("admin-1", "thread-1");

    expect(prismaMock.assistantThread.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        select: expect.objectContaining({
          messages: expect.objectContaining({ take: 31 }),
        }),
      }),
    );
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
          run: { _count: { toolRuns: 1 }, toolRuns: [] },
        },
        {
          role: "USER",
          content: "Use this calendar.",
          attachments: [{ name: "calendar.jpg" }],
          createdAt: new Date(),
          run: {
            status: "COMPLETED",
            _count: { toolRuns: 1 },
            toolRuns: [
              {
                namespace: "students",
                toolName: "get_student",
                status: "COMPLETED",
                result: { card: { entityKey: "student:student-1" } },
              },
            ],
          },
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
    expect(context?.messages[0].toolResults).toEqual([
      { card: { entityKey: "student:student-1" } },
    ]);
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

  it("returns bounded server-authored audit state for unresolved operations", async () => {
    prismaMock.assistantThread.findFirst.mockResolvedValue({
      contextSummary: null,
      _count: { runs: 0 },
      messages: [
        {
          role: "USER",
          content: "Send the message",
          attachments: null,
          createdAt: new Date(),
          run: {
            status: "FAILED",
            hasAttachments: false,
            toolRuns: [
              {
                namespace: "communications",
                toolName: "send_email",
                status: "UNKNOWN",
                result: null,
              },
            ],
          },
        },
      ],
    });
    prismaMock.assistantToolRun.findMany.mockResolvedValue([
      {
        namespace: "communications",
        toolName: "send_email",
        status: "UNKNOWN",
        run: { status: "FAILED" },
      },
    ]);

    const context = await getAssistantContext("admin-1", "thread-1");

    expect(context).toMatchObject({
      safetyToolAudits: [
        {
          namespace: "communications",
          toolName: "send_email",
          status: "UNKNOWN",
          runStatus: "FAILED",
        },
      ],
      safetyToolAuditsTruncated: false,
      messages: [
        expect.objectContaining({
          operationAudit: {
            runStatus: "FAILED",
            tools: [
              {
                namespace: "communications",
                toolName: "send_email",
                status: "UNKNOWN",
              },
            ],
          },
        }),
      ],
    });
    expect(prismaMock.assistantToolRun.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          run: {
            threadId: "thread-1",
            thread: { adminId: "admin-1" },
          },
          OR: [
            { status: { in: ["RUNNING", "UNKNOWN"] } },
            { status: "COMPLETED", run: { status: "FAILED" } },
          ],
        },
        take: 21,
        select: {
          namespace: true,
          toolName: true,
          status: true,
          run: { select: { status: true } },
        },
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

    expect(prismaMock.$transaction).toHaveBeenCalledWith(expect.any(Function), {
      isolationLevel: "Serializable",
    });
  });

  it("replays the winning run when identical client turns race on the unique key", async () => {
    const thread = {
      id: "thread-1",
      adminId: "admin-1",
      archivedAt: null,
    };
    const winningRun = {
      id: "run-1",
      threadId: thread.id,
      clientTurnId: "turn-1",
      status: "RUNNING",
      thread,
      messages: [{ id: "message-1", role: "USER" }],
      toolRuns: [],
    };
    prismaMock.$transaction.mockRejectedValueOnce(
      new Prisma.PrismaClientKnownRequestError(
        "Unique constraint failed on clientTurnId",
        {
          code: "P2002",
          clientVersion: "test",
          meta: { target: ["clientTurnId"] },
        },
      ),
    );
    prismaMock.assistantRun.findUnique.mockResolvedValue(winningRun);
    prismaMock.assistantMessage.count.mockResolvedValue(1);

    await expect(
      createAssistantTurn({
        adminId: "admin-1",
        threadId: "thread-1",
        clientTurnId: "turn-1",
        message: "Submit once",
        model: "gpt-5.6-luna",
      }),
    ).resolves.toEqual({
      thread,
      run: winningRun,
      duplicate: true,
      messageCount: 1,
    });
    expect(prismaMock.assistantRun.findUnique).toHaveBeenCalledWith({
      where: { clientTurnId: "turn-1" },
      include: {
        thread: true,
        messages: true,
        toolRuns: true,
      },
    });
    expect(prismaMock.assistantMessage.count).toHaveBeenCalledWith({
      where: {
        threadId: "thread-1",
        OR: [{ runId: null }, { run: { supersededAt: null } }],
      },
    });
  });

  it("does not replay a raced client turn owned by another administrator", async () => {
    prismaMock.$transaction.mockRejectedValueOnce(
      new Prisma.PrismaClientKnownRequestError(
        "Unique constraint failed on clientTurnId",
        {
          code: "P2002",
          clientVersion: "test",
          meta: { target: ["clientTurnId"] },
        },
      ),
    );
    prismaMock.assistantRun.findUnique.mockResolvedValue({
      id: "run-other",
      threadId: "thread-other",
      thread: {
        id: "thread-other",
        adminId: "admin-other",
        archivedAt: null,
      },
      messages: [],
      toolRuns: [],
    });

    await expect(
      createAssistantTurn({
        adminId: "admin-1",
        clientTurnId: "turn-shared",
        message: "Submit once",
        model: "gpt-5.6-luna",
      }),
    ).rejects.toThrow("identifier is unavailable");
    expect(prismaMock.assistantMessage.count).not.toHaveBeenCalled();
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

  it("preserves a 70-message rolling summary across a safe retry", async () => {
    const thread = {
      id: "thread-1",
      adminId: "admin-1",
      archivedAt: null,
      contextSummary: "Durable context through message 70",
      summarizedMessageCount: 70,
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
      assistantMessage: {
        findFirst: vi.fn().mockResolvedValue({
          id: "message-100",
          createdAt: new Date("2026-08-23T12:00:00.000Z"),
        }),
        count: vi
          .fn()
          .mockResolvedValueOnce(100)
          .mockResolvedValueOnce(100),
      },
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

  it("rejects retrying a failed message that is already in the rolling summary", async () => {
    const thread = {
      id: "thread-1",
      adminId: "admin-1",
      archivedAt: null,
      contextSummary: "Durable context through message 70",
      summarizedMessageCount: 70,
    };
    const tx = {
      assistantThread: {
        findFirst: vi.fn().mockResolvedValue(thread),
        update: vi.fn(),
      },
      assistantMessage: {
        findFirst: vi.fn().mockResolvedValue({
          id: "message-40",
          createdAt: new Date("2026-08-20T12:00:00.000Z"),
        }),
        count: vi.fn().mockResolvedValue(40),
      },
      assistantRun: {
        findUnique: vi.fn().mockResolvedValue(null),
        findFirst: vi.fn().mockResolvedValue(null),
        findMany: vi.fn().mockResolvedValue([]),
        updateMany: vi.fn(),
        create: vi.fn(),
      },
      assistantToolRun: {
        findMany: vi.fn().mockResolvedValue([]),
        updateMany: vi.fn().mockResolvedValue({ count: 0 }),
      },
    };
    prismaMock.$transaction.mockImplementation(
      (callback: (client: typeof tx) => unknown) => callback(tx),
    );

    await expect(
      createAssistantTurn({
        adminId: "admin-1",
        threadId: "thread-1",
        clientTurnId: "turn-new",
        message: "Edited old request",
        supersedesRunId: "run-old",
        model: "gpt-5.6-luna",
      }),
    ).rejects.toThrow("older failed request can no longer be retried");

    expect(tx.assistantRun.updateMany).not.toHaveBeenCalled();
    expect(tx.assistantRun.create).not.toHaveBeenCalled();
  });

  it("only advances summaries monotonically when refreshes resolve out of order", async () => {
    prismaMock.assistantThread.updateMany
      .mockResolvedValueOnce({ count: 1 })
      .mockResolvedValueOnce({ count: 0 });

    await setAssistantThreadSummary("admin-1", "thread-1", "Newer summary", 80);
    await setAssistantThreadSummary(
      "admin-1",
      "thread-1",
      "Older slow summary",
      40,
    );

    expect(prismaMock.assistantThread.updateMany).toHaveBeenNthCalledWith(1, {
      where: {
        id: "thread-1",
        adminId: "admin-1",
        summarizedMessageCount: { lt: 80 },
      },
      data: {
        contextSummary: "Newer summary",
        summarizedMessageCount: 80,
      },
    });
    expect(prismaMock.assistantThread.updateMany).toHaveBeenNthCalledWith(2, {
      where: {
        id: "thread-1",
        adminId: "admin-1",
        summarizedMessageCount: { lt: 40 },
      },
      data: {
        contextSummary: "Older slow summary",
        summarizedMessageCount: 40,
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
    const tx = {
      assistantThread: {
        updateMany: vi.fn().mockResolvedValue({ count: 0 }),
        findFirst: vi.fn().mockResolvedValue({
          id: "thread-1",
          archivedAt: null,
          runs: [{ id: "run-1" }],
        }),
      },
      assistantToolRun: {
        findMany: vi.fn().mockResolvedValue([]),
        updateMany: vi.fn().mockResolvedValue({ count: 0 }),
      },
      assistantRun: {
        findMany: vi.fn().mockResolvedValue([]),
        updateMany: vi.fn().mockResolvedValue({ count: 0 }),
      },
    };
    prismaMock.$transaction.mockImplementation(
      (callback: (client: typeof tx) => unknown) => callback(tx),
    );

    await expect(
      archiveAssistantThread("admin-1", "thread-1", true),
    ).rejects.toThrow("active request or pending approval");

    expect(tx.assistantThread.updateMany).toHaveBeenCalledWith(
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

  it("expires a due approval and archives immediately without a reload", async () => {
    const tx = {
      assistantThread: {
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
        findFirst: vi.fn(),
      },
      assistantToolRun: {
        findMany: vi
          .fn()
          .mockResolvedValue([{ id: "tool-expired", runId: "run-expired" }]),
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
      },
      assistantRun: {
        findMany: vi.fn().mockResolvedValue([]),
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
      },
    };
    prismaMock.$transaction.mockImplementation(
      (callback: (client: typeof tx) => unknown) => callback(tx),
    );

    await archiveAssistantThread("admin-1", "thread-1", true);

    expect(tx.assistantToolRun.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          status: "PENDING_CONFIRMATION",
          expiresAt: { lte: expect.any(Date) },
          run: expect.objectContaining({
            thread: { adminId: "admin-1", id: "thread-1" },
          }),
        }),
      }),
    );
    expect(tx.assistantRun.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ id: { in: ["run-expired"] } }),
        data: expect.objectContaining({ status: "FAILED" }),
      }),
    );
    expect(tx.assistantThread.updateMany).toHaveBeenCalledWith(
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

  it("restores an archived thread only within the requesting admin scope", async () => {
    prismaMock.assistantThread.updateMany.mockResolvedValue({ count: 1 });

    await expect(
      archiveAssistantThread("admin-1", "thread-1", false),
    ).resolves.toBeUndefined();

    expect(prismaMock.assistantThread.updateMany).toHaveBeenCalledWith({
      where: { id: "thread-1", adminId: "admin-1" },
      data: { archivedAt: null },
    });
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
