import { describe, expect, it } from "vitest";
import { classifyFailedAssistantRun } from "@/lib/services/assistant/recovery";

describe("assistant failed-run recovery", () => {
  it("allows a fresh retry after completed read-only tools", () => {
    expect(
      classifyFailedAssistantRun(
        [
          {
            namespace: "students",
            toolName: "search_students",
            status: "COMPLETED",
          },
        ],
        "STAFF",
      ),
    ).toEqual({
      outcomeUnknown: false,
      retryable: true,
      reuseClientTurnId: false,
    });
  });

  it("never offers one-click replay after a mutation was attempted", () => {
    expect(
      classifyFailedAssistantRun(
        [
          {
            namespace: "billing",
            toolName: "record_payment",
            status: "COMPLETED",
          },
        ],
        "STAFF",
      ),
    ).toEqual({
      outcomeUnknown: false,
      retryable: false,
      reuseClientTurnId: false,
    });
  });

  it("marks an interrupted mutation as outcome-unknown", () => {
    expect(
      classifyFailedAssistantRun(
        [
          {
            namespace: "schedule",
            toolName: "update_session",
            status: "UNKNOWN",
          },
        ],
        "STAFF",
      ),
    ).toEqual({
      outcomeUnknown: true,
      retryable: false,
      reuseClientTurnId: false,
    });
  });

  it("reuses the existing run only when failure happened before any tool", () => {
    expect(classifyFailedAssistantRun([], "STAFF")).toEqual({
      outcomeUnknown: false,
      retryable: true,
      reuseClientTurnId: true,
    });
  });
});
