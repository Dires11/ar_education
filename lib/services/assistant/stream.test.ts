import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/services/assistant/orchestrator", () => ({
  processAssistantDecision: vi.fn(),
  processAssistantTurn: vi.fn(),
}));

import { createAssistantEventResponse } from "@/lib/services/assistant/stream";

describe("assistant SSE transport", () => {
  it("streams typed events and closes after the task completes", async () => {
    const response = createAssistantEventResponse(async (emit) => {
      emit({ type: "assistant_delta", delta: "Hello" });
    });

    expect(response.headers.get("content-type")).toContain("text/event-stream");
    await expect(response.text()).resolves.toContain(
      '"type":"assistant_delta","delta":"Hello"',
    );
  });

  it("aborts provider work and suppresses late events when the client cancels", async () => {
    const aborted = vi.fn();
    let releaseTask: () => void = () => undefined;
    const taskDone = new Promise<void>((resolve) => {
      releaseTask = resolve;
    });
    const response = createAssistantEventResponse(async (emit, signal) => {
      signal.addEventListener("abort", aborted, { once: true });
      await taskDone;
      emit({ type: "assistant_delta", delta: "too late" });
    });
    const reader = response.body!.getReader();

    await reader.cancel("browser disconnected");
    releaseTask();
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(aborted).toHaveBeenCalledTimes(1);
  });

  it("propagates the incoming request abort signal", async () => {
    const request = new AbortController();
    let taskSignal: AbortSignal | undefined;
    const response = createAssistantEventResponse(async (_emit, signal) => {
      taskSignal = signal;
      await new Promise<void>((resolve) =>
        signal.addEventListener("abort", () => resolve(), { once: true }),
      );
    }, request.signal);

    request.abort("navigation");
    await expect(response.text()).resolves.toBe("");
    expect(taskSignal?.aborted).toBe(true);
  });
});
