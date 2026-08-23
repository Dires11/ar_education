import { describe, expect, it } from "vitest";
import { ASSISTANT_ROUTING_EVAL_CASES } from "@/lib/services/assistant/evals";
import {
  assistantToolRequiresConfirmation,
  getAssistantToolSpec,
} from "@/lib/services/assistant/tools";

describe("assistant routing evaluation set", () => {
  it("requires an exact, available owner tool for every scenario", () => {
    expect(ASSISTANT_ROUTING_EVAL_CASES.length).toBeGreaterThanOrEqual(10);
    for (const item of ASSISTANT_ROUTING_EVAL_CASES) {
      expect(item.expectedTool).toBeTruthy();
      expect(
        getAssistantToolSpec(
          item.expectedNamespace,
          item.expectedTool,
          "OWNER",
        ),
        item.name,
      ).toBeDefined();
      const expectedSpec = getAssistantToolSpec(
        item.expectedNamespace,
        item.expectedTool,
        "OWNER",
      );
      if (item.expectedConfirmation !== undefined && expectedSpec) {
        const exampleArguments =
          item.expectedTool === "mark_attendance"
            ? {
                sessionId: "session_123",
                attendances: [
                  {
                    studentId: "student_123",
                    status: "COMPLETED",
                    billable: true,
                  },
                ],
              }
            : {};
        expect(
          assistantToolRequiresConfirmation(expectedSpec, exampleArguments),
          item.name,
        ).toBe(item.expectedConfirmation);
      }
      for (const lookupGroup of item.requiredLookupGroups ?? []) {
        for (const lookup of lookupGroup) {
          const [namespace, name] = lookup.split(".");
          expect(getAssistantToolSpec(namespace, name, "OWNER"), item.name).toBeDefined();
        }
      }
    }
  });

  it("covers read, create, schedule, billing, communication, and access flows", () => {
    const tools = new Set(
      ASSISTANT_ROUTING_EVAL_CASES.map(
        (item) => `${item.expectedNamespace}.${item.expectedTool}`,
      ),
    );
    expect(tools.size).toBeGreaterThanOrEqual(8);
    expect(tools).toContain("students.query_student_directory");
    expect(tools).toContain("students.create_student");
    expect(tools).toContain("enrollments.create_enrollment");
    expect(tools).toContain("recurrence.create_recurring_schedule");
    expect(tools).toContain("schedule.get_enrollment_capacity");
    expect(tools).toContain("schedule.preview_recurring_schedule");
    expect(tools).toContain("schedule.mark_attendance");
    expect(tools).toContain("billing.record_payment");
    expect(tools).toContain("billing.send_payment_reminder");
    expect(tools).toContain("team.invite_team_member");
  });
});
