import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/utils/auth", () => ({
  requireAdmin: vi.fn(async () => ({ id: "admin-1", role: "STAFF" })),
}));
vi.mock("@/lib/services/assistant/stream", () => ({
  streamAssistantDecision: vi.fn(),
  streamAssistantTurn: vi.fn(),
}));
const historyMocks = vi.hoisted(() => ({
  getAssistantHistoryPage: vi.fn(async () => ({
    kind: "threads",
    threads: [],
    hasMore: false,
    nextCursor: null,
  })),
}));
vi.mock("@/lib/services/assistant/orchestrator", () => historyMocks);

import { GET as getHistory } from "@/app/api/assistant/history/route";
import { POST as postDecision } from "@/app/api/assistant/tool-runs/[id]/decision/route";
import { POST as postTurn } from "@/app/api/assistant/turn/route";

const malformedRequest = () =>
  new Request("http://localhost/api/assistant", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: "{",
  });

describe("assistant route validation", () => {
  it("returns 400 for a malformed turn body", async () => {
    const response = await postTurn(malformedRequest());

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      error: expect.stringContaining("malformed JSON"),
    });
  });

  it("returns 400 for a malformed decision body", async () => {
    const response = await postDecision(malformedRequest(), {
      params: Promise.resolve({ id: "tool-1" }),
    });

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      error: expect.stringContaining("malformed JSON"),
    });
  });

  it("validates and delegates bounded history requests", async () => {
    const invalid = await getHistory(
      new Request("http://localhost/api/assistant/history?kind=threads"),
    );
    expect(invalid.status).toBe(400);

    const valid = await getHistory(
      new Request(
        "http://localhost/api/assistant/history?kind=threads&beforeAt=2026-08-23T12%3A00%3A00.000Z&beforeId=thread-50",
      ),
    );
    expect(valid.status).toBe(200);
    expect(historyMocks.getAssistantHistoryPage).toHaveBeenCalledWith(
      { id: "admin-1", role: "STAFF" },
      {
        kind: "threads",
        beforeAt: "2026-08-23T12:00:00.000Z",
        beforeId: "thread-50",
      },
    );
  });
});
