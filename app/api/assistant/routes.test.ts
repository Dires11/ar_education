import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/utils/auth", () => ({
  requireAdmin: vi.fn(async () => ({ id: "admin-1", role: "STAFF" })),
}));
vi.mock("@/lib/services/assistant/stream", () => ({
  streamAssistantDecision: vi.fn(),
  streamAssistantTurn: vi.fn(),
}));

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
});
