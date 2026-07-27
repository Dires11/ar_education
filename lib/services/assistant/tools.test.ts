import { describe, expect, it } from "vitest";
import {
  assistantResultCardSchema,
  assistantTurnSchema,
} from "@/lib/validators/assistant";
import {
  assistantToolRequiresConfirmation,
  getAssistantNamespaceCounts,
  getAssistantOpenAITools,
  getAssistantToolSpec,
  getAssistantToolSpecs,
} from "@/lib/services/assistant/tools";

describe("assistant tool registry", () => {
  it("keeps namespaces small and every function deferred", () => {
    const counts = getAssistantNamespaceCounts("OWNER");
    expect(Object.values(counts).every((count) => count < 10)).toBe(true);

    const tools = getAssistantOpenAITools("OWNER");
    const namespaces = tools.filter((tool) => tool.type === "namespace");
    expect(namespaces.length).toBeGreaterThan(5);
    for (const namespace of namespaces) {
      expect(namespace.tools.length).toBeLessThan(10);
      expect(
        namespace.tools.every(
          (tool) => tool.type !== "function" || tool.defer_loading === true,
        ),
      ).toBe(true);
    }
    expect(tools.at(-1)).toEqual({ type: "tool_search" });
  });

  it("omits all owner-only team tools for staff", () => {
    const ownerNames = getAssistantToolSpecs("OWNER").map(
      (spec) => `${spec.namespace}.${spec.name}`,
    );
    const staffNames = getAssistantToolSpecs("STAFF").map(
      (spec) => `${spec.namespace}.${spec.name}`,
    );

    expect(ownerNames).toContain("team.invite_team_member");
    expect(ownerNames).toContain("team.get_team");
    expect(staffNames).not.toContain("team.invite_team_member");
    expect(staffNames).not.toContain("team.get_team");
  });

  it("classifies destructive, financial, outbound, and access writes", () => {
    const deleteStudent = getAssistantToolSpec(
      "students",
      "delete_student",
      "OWNER",
    )!;
    const createStudent = getAssistantToolSpec(
      "students",
      "create_student",
      "OWNER",
    )!;
    const studentStatus = getAssistantToolSpec(
      "students",
      "set_student_status",
      "OWNER",
    )!;

    expect(assistantToolRequiresConfirmation(deleteStudent, { id: "x" })).toBe(
      true,
    );
    expect(assistantToolRequiresConfirmation(createStudent, {})).toBe(false);
    expect(
      assistantToolRequiresConfirmation(studentStatus, {
        id: "x",
        status: "PAUSED",
      }),
    ).toBe(false);
    expect(
      assistantToolRequiresConfirmation(studentStatus, {
        id: "x",
        status: "INACTIVE",
      }),
    ).toBe(true);

    const packageStatus = getAssistantToolSpec(
      "catalog",
      "set_package_active",
      "OWNER",
    )!;
    expect(
      assistantToolRequiresConfirmation(packageStatus, {
        id: "x",
        isActive: true,
      }),
    ).toBe(false);
    expect(
      assistantToolRequiresConfirmation(packageStatus, {
        id: "x",
        isActive: false,
      }),
    ).toBe(true);

    const attendance = getAssistantToolSpec(
      "schedule",
      "mark_attendance",
      "OWNER",
    )!;
    expect(
      assistantToolRequiresConfirmation(attendance, {
        sessionId: "session-1",
        attendances: [
          {
            studentId: "student-1",
            status: "COMPLETED",
            billable: true,
          },
        ],
      }),
    ).toBe(false);
    expect(
      assistantToolRequiresConfirmation(attendance, {
        sessionId: "session-1",
        attendances: [
          {
            studentId: "student-1",
            status: "CANCELLED_BY_STUDENT",
            billable: false,
          },
        ],
      }),
    ).toBe(true);

    const enrollmentUpdate = getAssistantToolSpec(
      "enrollments",
      "update_enrollment",
      "OWNER",
    )!;
    expect(
      assistantToolRequiresConfirmation(enrollmentUpdate, {
        id: "enrollment-1",
        status: "ACTIVE",
        endDate: "2026-08-01",
      }),
    ).toBe(true);
    expect(
      assistantToolRequiresConfirmation(enrollmentUpdate, {
        id: "enrollment-1",
        status: "ACTIVE",
        customPriceOverride: "150",
      }),
    ).toBe(false);
  });

  it("keeps partial guardian edits partial and bounds enrollment searches", () => {
    const guardianUpdate = getAssistantToolSpec(
      "guardians",
      "update_guardian",
      "STAFF",
    )!;
    expect(
      guardianUpdate.schema.parse({
        studentId: "student-1",
        guardianId: "guardian-1",
        phone: "555-0100",
      }),
    ).toEqual({
      studentId: "student-1",
      guardianId: "guardian-1",
      phone: "555-0100",
    });

    const enrollmentSearch = getAssistantToolSpec(
      "enrollments",
      "search_enrollments",
      "STAFF",
    )!;
    expect(enrollmentSearch.schema.parse({})).toEqual({ limit: 20 });
    expect(() => enrollmentSearch.schema.parse({ limit: 31 })).toThrow();
  });

  it("provides one bounded student-directory tool for rankings", () => {
    const directoryQuery = getAssistantToolSpec(
      "students",
      "query_student_directory",
      "STAFF",
    )!;

    expect(
      directoryQuery.schema.parse({
        sortBy: "DATE_OF_BIRTH",
        sortOrder: "DESC",
        limit: 1,
      }),
    ).toEqual({
      sortBy: "DATE_OF_BIRTH",
      sortOrder: "DESC",
      page: 1,
      limit: 1,
    });
    expect(directoryQuery.description).toContain("youngest");
    expect(assistantToolRequiresConfirmation(directoryQuery, {})).toBe(false);
  });
});

describe("assistant request validation", () => {
  it("accepts bounded, idempotent turns", () => {
    const value = assistantTurnSchema.parse({
      clientTurnId: "c7bcb6f9-41e7-4c17-bf0d-3e1b04c8e0d4",
      message: "Create a student",
    });
    expect(value.message).toBe("Create a student");
  });

  it("rejects invalid client turn IDs and empty messages", () => {
    expect(() =>
      assistantTurnSchema.parse({ clientTurnId: "retry-me", message: "" }),
    ).toThrow();
  });

  it("accepts an attachment-only turn and verifies encoded size", () => {
    const value = assistantTurnSchema.parse({
      clientTurnId: "c7bcb6f9-41e7-4c17-bf0d-3e1b04c8e0d4",
      message: "",
      attachments: [
        {
          name: "calendar.txt",
          mimeType: "text/plain",
          sizeBytes: 5,
          dataBase64: "aGVsbG8=",
        },
      ],
    });
    expect(value.attachments).toHaveLength(1);

    expect(() =>
      assistantTurnSchema.parse({
        clientTurnId: "c7bcb6f9-41e7-4c17-bf0d-3e1b04c8e0d4",
        message: "Read this",
        attachments: [
          {
            name: "calendar.txt",
            mimeType: "text/plain",
            sizeBytes: 4,
            dataBase64: "aGVsbG8=",
          },
        ],
      }),
    ).toThrow();
  });

  it("accepts typed internal result cards and rejects external record links", () => {
    const card = {
      kind: "STUDENT",
      entityKey: "student:student-1",
      title: "Maya Thompson",
      href: "/students?student=student-1",
      actionLabel: "View Maya's record",
      fields: [
        {
          label: "Guardian",
          value: "No guardian added",
          icon: "GUARDIAN",
        },
      ],
      suggestedActions: [
        {
          kind: "PROMPT",
          label: "Add guardian",
          prompt: "Add a guardian for Maya Thompson.",
        },
      ],
    };

    expect(assistantResultCardSchema.parse(card)).toMatchObject(card);
    expect(() =>
      assistantResultCardSchema.parse({
        ...card,
        href: "https://example.com/students/student-1",
      }),
    ).toThrow();
  });
});
