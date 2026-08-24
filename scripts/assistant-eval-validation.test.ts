import { describe, expect, it } from "vitest";
import { getAssistantToolSpec } from "@/lib/services/assistant/tools";
import { validateAssistantEvalArguments } from "./assistant-eval-validation";

describe("assistant live-evaluation argument validation", () => {
  const duesSpec = getAssistantToolSpec(
    "billing",
    "get_upcoming_dues",
    "OWNER",
  );

  it("uses the production tool schema and applies its defaults", () => {
    expect(duesSpec).toBeDefined();
    const result = validateAssistantEvalArguments(
      duesSpec!,
      JSON.stringify({
        status: "OVERDUE",
        fromMonth: "2024-09",
        toMonth: "2026-08",
      }),
    );

    expect(result).toEqual({
      success: true,
      arguments: {
        status: "OVERDUE",
        fromMonth: "2024-09",
        toMonth: "2026-08",
        page: 1,
        limit: 25,
      },
    });
  });

  it("rejects a call that exceeds the production 24-month window", () => {
    expect(duesSpec).toBeDefined();
    const result = validateAssistantEvalArguments(
      duesSpec!,
      JSON.stringify({
        status: "OVERDUE",
        fromMonth: "2024-09",
        toMonth: "2026-09",
      }),
    );

    expect(result).toMatchObject({
      success: false,
      error: expect.stringContaining("1 to 24 months"),
    });
  });

  it("rejects malformed JSON before schema validation", () => {
    expect(duesSpec).toBeDefined();
    expect(validateAssistantEvalArguments(duesSpec!, "{not-json")).toEqual({
      success: false,
      arguments: {},
      error: "Tool arguments were not valid JSON",
    });
  });
});
