import { beforeEach, describe, expect, it, vi } from "vitest";

const responses = vi.hoisted(() => ({
  queue: [] as Array<{
    events: Array<Record<string, unknown>>;
    final: Record<string, unknown>;
  }>,
  requests: [] as Array<Record<string, unknown>>,
}));

const dataMocks = vi.hoisted(() => ({
  completeAssistantRun: vi.fn(async () => ({ id: "message-assistant" })),
  completeAssistantToolRun: vi.fn(async () => undefined),
  createAssistantTurn: vi.fn(),
  createOrGetAssistantToolRun: vi.fn(),
  failAssistantRun: vi.fn(async () => undefined),
  failAssistantToolRun: vi.fn(async () => undefined),
  getAssistantContext: vi.fn(),
  getAssistantSummarySource: vi.fn(async () => null),
  getAssistantThread: vi.fn(),
  getAssistantToolRunForDecision: vi.fn(),
  pauseAssistantRun: vi.fn(),
  claimAssistantToolRun: vi.fn(),
  rejectAssistantToolRun: vi.fn(),
  setAssistantThreadSummary: vi.fn(),
}));

const executeMock = vi.hoisted(() => vi.fn());

vi.mock("openai", () => ({
  default: class FakeOpenAI {
    responses = {
      stream: (request: Record<string, unknown>) => {
        responses.requests.push(request);
        const item = responses.queue.shift();
        if (!item) throw new Error("No fake response queued");
        return {
          async *[Symbol.asyncIterator]() {
            for (const event of item.events) yield event;
          },
          finalResponse: async () => item.final,
        };
      },
      create: vi.fn(),
    };
  },
}));

vi.mock("@/lib/data/assistant", () => dataMocks);

vi.mock("@/lib/services/assistant/executor", () => ({
  executeAssistantTool: executeMock,
}));

vi.mock("@/lib/services/assistant/tools", async () => {
  const actual = await vi.importActual<
    typeof import("@/lib/services/assistant/tools")
  >("@/lib/services/assistant/tools");
  return {
    ...actual,
    getAssistantOpenAITools: () => [],
  };
});

import {
  attachmentScheduleToolRequiresConfirmation,
  prepareResumeInputForStorage,
  processAssistantDecision,
  processAssistantTurn,
} from "@/lib/services/assistant/orchestrator";

const usage = {
  input_tokens: 10,
  output_tokens: 5,
  input_tokens_details: { cached_tokens: 2, cache_write_tokens: 0 },
  output_tokens_details: { reasoning_tokens: 1 },
  total_tokens: 15,
};

describe("assistant orchestration", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    responses.queue.length = 0;
    responses.requests.length = 0;
    process.env.OPENAI_API_KEY = "test-key";
    dataMocks.createAssistantTurn.mockResolvedValue({
      thread: { id: "thread-1", title: "Test request" },
      run: { id: "run-1", messages: [], toolRuns: [], status: "RUNNING" },
      duplicate: false,
    });
    dataMocks.getAssistantContext.mockResolvedValue({
      summary: null,
      messages: [
        {
          role: "USER",
          content: "What is happening?",
          createdAt: new Date(),
        },
      ],
    });
  });

  it("streams and persists a read-only answer", async () => {
    responses.queue.push({
      events: [
        { type: "response.output_text.delta", delta: "All " },
        { type: "response.output_text.delta", delta: "set." },
      ],
      final: {
        output_text: "All set.",
        output: [],
        usage,
      },
    });
    const events: Array<Record<string, unknown>> = [];

    await processAssistantTurn(
      { id: "admin-1", role: "STAFF" },
      {
        clientTurnId: "c7bcb6f9-41e7-4c17-bf0d-3e1b04c8e0d4",
        message: "What is happening?",
      },
      (event) => events.push(event),
    );

    expect(events.map((event) => event.type)).toEqual([
      "thread_created",
      "assistant_delta",
      "assistant_delta",
      "assistant_completed",
    ]);
    expect(dataMocks.completeAssistantRun).toHaveBeenCalledWith(
      expect.objectContaining({
        runId: "run-1",
        content: "All set.",
      }),
    );
    expect(responses.requests[0]).toEqual(
      expect.objectContaining({
        model: "gpt-5.6-luna",
        store: false,
        parallel_tool_calls: false,
        reasoning: { effort: "medium", context: "current_turn" },
      }),
    );
    expect(responses.requests[0].safety_identifier).not.toBe("admin-1");
    expect(responses.requests[0].instructions).toEqual(
      expect.stringContaining("concise GitHub-flavored Markdown"),
    );
    expect(responses.requests[0].instructions).toEqual(
      expect.stringContaining("descriptive Markdown links"),
    );
  });

  it("constructs model context from the local summary and recent messages", async () => {
    dataMocks.getAssistantContext.mockResolvedValue({
      summary: "Student Maya was created with ID student-1.",
      messages: [
        {
          role: "USER",
          content: "What happened next?",
          createdAt: new Date(),
        },
        {
          role: "ASSISTANT",
          content: "No further changes yet.",
          createdAt: new Date(),
        },
      ],
    });
    responses.queue.push({
      events: [],
      final: {
        output_text: "No further changes yet.",
        output: [],
        usage,
      },
    });

    await processAssistantTurn(
      { id: "admin-1", role: "STAFF" },
      {
        clientTurnId: "c7bcb6f9-41e7-4c17-bf0d-3e1b04c8e0d4",
        message: "What happened next?",
      },
      () => undefined,
    );

    expect(responses.requests[0].input).toEqual([
      {
        role: "developer",
        content:
          "Earlier conversation summary:\nStudent Maya was created with ID student-1.",
      },
      { role: "user", content: "What happened next?" },
      { role: "assistant", content: "No further changes yet." },
    ]);
  });

  it("executes an immediate tool once and continues to a final answer", async () => {
    responses.queue.push(
      {
        events: [],
        final: {
          output_text: "",
          output: [
            {
              type: "function_call",
              namespace: "catalog",
              name: "list_subjects",
              call_id: "call-1",
              arguments: "{}",
              parsed_arguments: {},
            },
          ],
          usage,
        },
      },
      {
        events: [{ type: "response.output_text.delta", delta: "Found them." }],
        final: {
          output_text: "Found them.",
          output: [],
          usage,
        },
      },
    );
    dataMocks.createOrGetAssistantToolRun.mockResolvedValue({
      id: "tool-1",
      runId: "run-1",
      callId: "call-1",
      namespace: "catalog",
      toolName: "list_subjects",
      arguments: {},
      status: "RUNNING",
      requiresConfirmation: false,
    });
    executeMock.mockResolvedValue({ ok: true, data: [] });
    const events: Array<Record<string, unknown>> = [];

    await processAssistantTurn(
      { id: "admin-1", role: "STAFF" },
      {
        clientTurnId: "c7bcb6f9-41e7-4c17-bf0d-3e1b04c8e0d4",
        message: "List subjects",
      },
      (event) => events.push(event),
    );

    expect(executeMock).toHaveBeenCalledTimes(1);
    expect(dataMocks.completeAssistantToolRun).toHaveBeenCalledTimes(1);
    expect(events.map((event) => event.type)).toContain("tool_completed");
    expect(events.at(-1)?.type).toBe("assistant_completed");
    expect(JSON.stringify(responses.requests[1].input)).not.toContain(
      "parsed_arguments",
    );
  });

  it("sends current attachments as multimodal input without persisting bytes", async () => {
    responses.queue.push({
      events: [],
      final: {
        output_text: "I can read the calendar.",
        output: [],
        usage,
      },
    });

    await processAssistantTurn(
      { id: "admin-1", role: "STAFF" },
      {
        clientTurnId: "c7bcb6f9-41e7-4c17-bf0d-3e1b04c8e0d4",
        message: "Read this calendar",
        attachments: [
          {
            name: "calendar.jpg",
            mimeType: "image/jpeg",
            sizeBytes: 3,
            dataBase64: "YWJj",
          },
          {
            name: "notes.pdf",
            mimeType: "application/pdf",
            sizeBytes: 3,
            dataBase64: "ZGVm",
          },
        ],
      },
      () => undefined,
    );

    expect(dataMocks.createAssistantTurn).toHaveBeenCalledWith(
      expect.objectContaining({
        hasAttachments: true,
        attachments: [
          {
            name: "calendar.jpg",
            mimeType: "image/jpeg",
            sizeBytes: 3,
            kind: "IMAGE",
          },
          {
            name: "notes.pdf",
            mimeType: "application/pdf",
            sizeBytes: 3,
            kind: "DOCUMENT",
          },
        ],
      }),
    );
    const requestJson = JSON.stringify(responses.requests[0].input);
    expect(requestJson).toContain("input_image");
    expect(requestJson).toContain("data:image/jpeg;base64,YWJj");
    expect(requestJson).toContain("input_file");
    expect(requestJson).toContain("data:application/pdf;base64,ZGVm");
  });

  it("strips attachment bytes from paused continuation state", () => {
    const stored = prepareResumeInputForStorage([
      {
        role: "user",
        content: [
          { type: "input_text", text: "Use this calendar" },
          {
            type: "input_image",
            image_url: "data:image/jpeg;base64,c2Vuc2l0aXZl",
            detail: "high",
          },
          {
            type: "input_file",
            filename: "calendar.pdf",
            file_data: "data:application/pdf;base64,c2Vuc2l0aXZl",
          },
        ],
      },
    ]);

    const storedJson = JSON.stringify(stored);
    expect(storedJson).not.toContain("c2Vuc2l0aXZl");
    expect(storedJson).toContain("omitted");
  });

  it("requires confirmation for attachment-derived schedule writes", () => {
    expect(
      attachmentScheduleToolRequiresConfirmation(
        true,
        "recurrence",
        "create_recurring_schedule",
      ),
    ).toBe(true);
    expect(
      attachmentScheduleToolRequiresConfirmation(
        true,
        "schedule",
        "get_schedule",
      ),
    ).toBe(false);
    expect(
      attachmentScheduleToolRequiresConfirmation(
        false,
        "schedule",
        "create_one_time_session",
      ),
    ).toBe(false);
  });

  it("executes a sequential multi-step workflow", async () => {
    const createStudentArguments = {
      firstName: "Maya",
      lastName: "Thompson",
      dob: "2012-04-08",
    };
    const createEnrollmentArguments = {
      studentId: "student-1",
      packageId: "package-1",
      tutorId: "tutor-1",
      subjectId: "subject-1",
      startDate: "2026-08-01",
    };
    responses.queue.push(
      {
        events: [],
        final: {
          output_text: "",
          output: [
            {
              type: "function_call",
              namespace: "students",
              name: "create_student",
              call_id: "call-student",
              arguments: JSON.stringify(createStudentArguments),
            },
          ],
          usage,
        },
      },
      {
        events: [],
        final: {
          output_text: "",
          output: [
            {
              type: "function_call",
              namespace: "enrollments",
              name: "create_enrollment",
              call_id: "call-enrollment",
              arguments: JSON.stringify(createEnrollmentArguments),
            },
          ],
          usage,
        },
      },
      {
        events: [],
        final: {
          output_text: "Maya was created and enrolled.",
          output: [],
          usage,
        },
      },
    );
    dataMocks.createOrGetAssistantToolRun
      .mockResolvedValueOnce({
        id: "tool-student",
        runId: "run-1",
        callId: "call-student",
        namespace: "students",
        toolName: "create_student",
        arguments: createStudentArguments,
        status: "RUNNING",
        requiresConfirmation: false,
      })
      .mockResolvedValueOnce({
        id: "tool-enrollment",
        runId: "run-1",
        callId: "call-enrollment",
        namespace: "enrollments",
        toolName: "create_enrollment",
        arguments: createEnrollmentArguments,
        status: "RUNNING",
        requiresConfirmation: false,
      });
    executeMock
      .mockResolvedValueOnce({ ok: true, data: { id: "student-1" } })
      .mockResolvedValueOnce({ ok: true, data: { id: "enrollment-1" } });

    await processAssistantTurn(
      { id: "admin-1", role: "STAFF" },
      {
        clientTurnId: "c7bcb6f9-41e7-4c17-bf0d-3e1b04c8e0d4",
        message: "Create and enroll Maya",
      },
      () => undefined,
    );

    expect(executeMock).toHaveBeenCalledTimes(2);
    expect(executeMock.mock.calls[1][0]).toEqual(
      expect.objectContaining({
        namespace: "enrollments",
        argumentsValue: expect.objectContaining({ studentId: "student-1" }),
      }),
    );
    expect(dataMocks.completeAssistantRun).toHaveBeenCalledWith(
      expect.objectContaining({ content: "Maya was created and enrolled." }),
    );
  });

  it("returns ambiguous lookup candidates without guessing a mutation target", async () => {
    responses.queue.push(
      {
        events: [],
        final: {
          output_text: "",
          output: [
            {
              type: "function_call",
              namespace: "students",
              name: "search_students",
              call_id: "call-search",
              arguments: JSON.stringify({ query: "Maya", limit: 10 }),
            },
          ],
          usage,
        },
      },
      {
        events: [],
        final: {
          output_text:
            "I found two students named Maya. Which student do you mean?",
          output: [],
          usage,
        },
      },
    );
    dataMocks.createOrGetAssistantToolRun.mockResolvedValue({
      id: "tool-search",
      runId: "run-1",
      callId: "call-search",
      namespace: "students",
      toolName: "search_students",
      arguments: { query: "Maya", limit: 10 },
      status: "RUNNING",
      requiresConfirmation: false,
    });
    executeMock.mockResolvedValue({
      ok: true,
      data: {
        total: 2,
        students: [
          { id: "student-1", name: "Maya Thompson" },
          { id: "student-2", name: "Maya Chen" },
        ],
      },
    });

    await processAssistantTurn(
      { id: "admin-1", role: "STAFF" },
      {
        clientTurnId: "c7bcb6f9-41e7-4c17-bf0d-3e1b04c8e0d4",
        message: "Update Maya",
      },
      () => undefined,
    );

    expect(executeMock).toHaveBeenCalledTimes(1);
    expect(executeMock.mock.calls[0][0]).toEqual(
      expect.objectContaining({ name: "search_students" }),
    );
    expect(dataMocks.completeAssistantRun).toHaveBeenCalledWith(
      expect.objectContaining({
        content: expect.stringContaining("Which student"),
      }),
    );
  });

  it("pauses a risky mutation and emits a deterministic confirmation", async () => {
    const paymentArguments = {
      studentId: "student-1",
      amount: "120",
      method: "CARD",
      paidAt: "2026-07-26",
    };
    responses.queue.push({
      events: [],
      final: {
        output_text: "",
        output: [
          {
            type: "function_call",
            namespace: "billing",
            name: "record_payment",
            call_id: "call-payment",
            arguments: JSON.stringify(paymentArguments),
          },
        ],
        usage,
      },
    });
    dataMocks.createOrGetAssistantToolRun.mockResolvedValue({
      id: "tool-payment",
      runId: "run-1",
      callId: "call-payment",
      namespace: "billing",
      toolName: "record_payment",
      arguments: paymentArguments,
      status: "PENDING_CONFIRMATION",
      requiresConfirmation: true,
    });
    const events: Array<Record<string, unknown>> = [];

    await processAssistantTurn(
      { id: "admin-1", role: "STAFF" },
      {
        clientTurnId: "c7bcb6f9-41e7-4c17-bf0d-3e1b04c8e0d4",
        message: "Record the payment",
      },
      (event) => events.push(event),
    );

    expect(executeMock).not.toHaveBeenCalled();
    expect(dataMocks.pauseAssistantRun).toHaveBeenCalledTimes(1);
    expect(events.at(-1)).toEqual(
      expect.objectContaining({
        type: "confirmation_required",
        toolRunId: "tool-payment",
        namespace: "billing",
        toolName: "record_payment",
      }),
    );
  });

  it("claims an approval, executes once, and resumes the paused turn", async () => {
    const toolRun = {
      id: "tool-payment",
      runId: "run-1",
      callId: "call-payment",
      namespace: "billing",
      toolName: "record_payment",
      arguments: {
        studentId: "student-1",
        amount: "120",
        method: "CARD",
        paidAt: "2026-07-26",
      },
      status: "PENDING_CONFIRMATION",
      requiresConfirmation: true,
      run: {
        id: "run-1",
        threadId: "thread-1",
        status: "WAITING_CONFIRMATION",
        resumeInput: [
          {
            type: "function_call",
            namespace: "billing",
            name: "record_payment",
            call_id: "call-payment",
            arguments: "{}",
          },
        ],
      },
    };
    dataMocks.getAssistantToolRunForDecision.mockResolvedValue(toolRun);
    dataMocks.claimAssistantToolRun.mockResolvedValue(toolRun);
    executeMock.mockResolvedValue({ ok: true, data: { id: "payment-1" } });
    responses.queue.push({
      events: [{ type: "response.output_text.delta", delta: "Payment recorded." }],
      final: {
        output_text: "Payment recorded.",
        output: [],
        usage,
      },
    });
    const events: Array<Record<string, unknown>> = [];

    await processAssistantDecision(
      { id: "admin-1", role: "STAFF" },
      "tool-payment",
      "APPROVE",
      (event) => events.push(event),
    );

    expect(dataMocks.claimAssistantToolRun).toHaveBeenCalledTimes(1);
    expect(executeMock).toHaveBeenCalledTimes(1);
    expect(dataMocks.completeAssistantToolRun).toHaveBeenCalledTimes(1);
    expect(events.at(-1)?.type).toBe("assistant_completed");
  });

  it("records a rejection without executing the mutation and resumes", async () => {
    const toolRun = {
      id: "tool-payment",
      runId: "run-1",
      callId: "call-payment",
      namespace: "billing",
      toolName: "record_payment",
      arguments: {},
      status: "PENDING_CONFIRMATION",
      requiresConfirmation: true,
      run: {
        id: "run-1",
        threadId: "thread-1",
        status: "WAITING_CONFIRMATION",
        resumeInput: [],
      },
    };
    dataMocks.getAssistantToolRunForDecision.mockResolvedValue(toolRun);
    dataMocks.rejectAssistantToolRun.mockResolvedValue(toolRun);
    responses.queue.push({
      events: [],
      final: {
        output_text: "The payment was not recorded.",
        output: [],
        usage,
      },
    });

    await processAssistantDecision(
      { id: "admin-1", role: "STAFF" },
      "tool-payment",
      "REJECT",
      () => undefined,
    );

    expect(dataMocks.rejectAssistantToolRun).toHaveBeenCalledTimes(1);
    expect(executeMock).not.toHaveBeenCalled();
    expect(dataMocks.completeAssistantRun).toHaveBeenCalledWith(
      expect.objectContaining({ content: "The payment was not recorded." }),
    );
  });

  it("returns malformed tool arguments to the model without executing", async () => {
    responses.queue.push(
      {
        events: [],
        final: {
          output_text: "",
          output: [
            {
              type: "function_call",
              namespace: "catalog",
              name: "create_subject",
              call_id: "bad-call",
              arguments: "{not-json",
            },
          ],
          usage,
        },
      },
      {
        events: [],
        final: {
          output_text: "I need a valid subject name.",
          output: [],
          usage,
        },
      },
    );

    await processAssistantTurn(
      { id: "admin-1", role: "STAFF" },
      {
        clientTurnId: "c7bcb6f9-41e7-4c17-bf0d-3e1b04c8e0d4",
        message: "Create a subject",
      },
      () => undefined,
    );

    expect(dataMocks.createOrGetAssistantToolRun).not.toHaveBeenCalled();
    expect(executeMock).not.toHaveBeenCalled();
    expect(dataMocks.completeAssistantRun).toHaveBeenCalledWith(
      expect.objectContaining({ content: "I need a valid subject name." }),
    );
  });

  it("does not expose owner-only tools to staff at execution time", async () => {
    responses.queue.push(
      {
        events: [],
        final: {
          output_text: "",
          output: [
            {
              type: "function_call",
              namespace: "team",
              name: "invite_team_member",
              call_id: "owner-call",
              arguments: JSON.stringify({ email: "staff@example.com" }),
            },
          ],
          usage,
        },
      },
      {
        events: [],
        final: {
          output_text: "Only an owner can manage team access.",
          output: [],
          usage,
        },
      },
    );

    await processAssistantTurn(
      { id: "admin-1", role: "STAFF" },
      {
        clientTurnId: "c7bcb6f9-41e7-4c17-bf0d-3e1b04c8e0d4",
        message: "Invite a team member",
      },
      () => undefined,
    );

    expect(executeMock).not.toHaveBeenCalled();
    expect(dataMocks.createOrGetAssistantToolRun).not.toHaveBeenCalled();
  });

  it("persists a service failure and lets the model explain recovery", async () => {
    responses.queue.push(
      {
        events: [],
        final: {
          output_text: "",
          output: [
            {
              type: "function_call",
              namespace: "catalog",
              name: "create_subject",
              call_id: "call-failing",
              arguments: JSON.stringify({ name: "Algebra" }),
            },
          ],
          usage,
        },
      },
      {
        events: [],
        final: {
          output_text: "That subject already exists.",
          output: [],
          usage,
        },
      },
    );
    dataMocks.createOrGetAssistantToolRun.mockResolvedValue({
      id: "tool-failing",
      runId: "run-1",
      callId: "call-failing",
      namespace: "catalog",
      toolName: "create_subject",
      arguments: { name: "Algebra" },
      status: "RUNNING",
      requiresConfirmation: false,
    });
    executeMock.mockRejectedValue(new Error("Subject already exists"));

    await processAssistantTurn(
      { id: "admin-1", role: "STAFF" },
      {
        clientTurnId: "c7bcb6f9-41e7-4c17-bf0d-3e1b04c8e0d4",
        message: "Create Algebra",
      },
      () => undefined,
    );

    expect(dataMocks.failAssistantToolRun).toHaveBeenCalledWith(
      "tool-failing",
      "Subject already exists",
    );
    expect(dataMocks.completeAssistantRun).toHaveBeenCalledWith(
      expect.objectContaining({ content: "That subject already exists." }),
    );
  });

  it("replays a completed idempotent turn without calling OpenAI", async () => {
    dataMocks.createAssistantTurn.mockResolvedValue({
      thread: { id: "thread-1", title: "Test request" },
      run: {
        id: "run-1",
        status: "COMPLETED",
        messages: [
          {
            id: "message-existing",
            role: "ASSISTANT",
            content: "Already completed.",
          },
        ],
        toolRuns: [],
      },
      duplicate: true,
    });
    const events: Array<Record<string, unknown>> = [];

    await processAssistantTurn(
      { id: "admin-1", role: "STAFF" },
      {
        clientTurnId: "c7bcb6f9-41e7-4c17-bf0d-3e1b04c8e0d4",
        message: "Retry",
      },
      (event) => events.push(event),
    );

    expect(responses.requests).toHaveLength(0);
    expect(events.at(-1)).toEqual(
      expect.objectContaining({
        type: "assistant_completed",
        messageId: "message-existing",
      }),
    );
  });

  it("marks the run failed when OpenAI is unavailable", async () => {
    await expect(
      processAssistantTurn(
        { id: "admin-1", role: "STAFF" },
        {
          clientTurnId: "c7bcb6f9-41e7-4c17-bf0d-3e1b04c8e0d4",
          message: "Help me",
        },
        () => undefined,
      ),
    ).rejects.toThrow("No fake response queued");

    expect(dataMocks.failAssistantRun).toHaveBeenCalledWith(
      "run-1",
      "No fake response queued",
    );
  });
});
