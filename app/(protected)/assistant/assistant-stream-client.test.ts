import { describe, expect, it, vi } from "vitest";
import {
  consumeAssistantEventStream,
  getToolCompletionStatus,
  IncompleteAssistantStreamError,
  isAssistantOutcomeUnknown,
  isVisibleConfirmationArgument,
} from "./assistant-stream-client";

function eventStream(frames: string[]) {
  return new Response(frames.map((frame) => `data: ${frame}\n\n`).join(""), {
    headers: { "Content-Type": "text/event-stream" },
  });
}

describe("assistant stream client", () => {
  it.each(["assistant_completed", "confirmation_required", "error"])(
    "accepts the %s terminal event",
    async (type) => {
      const onEvent = vi.fn();
      await consumeAssistantEventStream(eventStream([JSON.stringify({ type })]), onEvent);
      expect(onEvent).toHaveBeenCalledWith({ type });
    },
  );

  it("rejects a clean EOF that arrives before a terminal event", async () => {
    await expect(
      consumeAssistantEventStream(
        eventStream([
          JSON.stringify({ type: "thread_created", threadId: "thread-1" }),
          JSON.stringify({ type: "assistant_delta", delta: "partial" }),
        ]),
        vi.fn(),
      ),
    ).rejects.toBeInstanceOf(IncompleteAssistantStreamError);
  });

  it("classifies completed, failed, and rejected tool results", () => {
    expect(getToolCompletionStatus({ ok: true })).toBe("COMPLETED");
    expect(getToolCompletionStatus({ ok: false })).toBe("FAILED");
    expect(
      getToolCompletionStatus({ ok: false, status: "rejected_by_user" }),
    ).toBe("REJECTED");
    expect(
      getToolCompletionStatus({ ok: false, status: "outcome_unknown" }),
    ).toBe("UNKNOWN");
  });

  it("marks incomplete connections as non-retryable unknown outcomes", () => {
    expect(
      isAssistantOutcomeUnknown(
        new IncompleteAssistantStreamError("connection closed"),
      ),
    ).toBe(true);
    expect(isAssistantOutcomeUnknown(new Error("Validation failed"))).toBe(
      false,
    );
  });

  it("hides internal confirmation metadata and database IDs", () => {
    expect(isVisibleConfirmationArgument("__assistantConfirmation")).toBe(
      false,
    );
    expect(isVisibleConfirmationArgument("studentId")).toBe(false);
    expect(isVisibleConfirmationArgument("messagePreview")).toBe(true);
  });
});
