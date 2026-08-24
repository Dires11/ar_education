import { describe, expect, it } from "vitest";
import {
  assistantResultCardSchema,
  assistantTurnSchema,
  normalizeAssistantResultCard,
} from "@/lib/validators/assistant";
import {
  assistantToolMutatesData,
  assistantToolRequiresConfirmation,
  getAssistantNamespaceCounts,
  getAssistantOpenAITools,
  getAssistantToolSpec,
  getAssistantToolSpecs,
} from "@/lib/services/assistant/tools";
import { createAdHocSessionSchema } from "@/lib/validators/sessions";

describe("assistant tool registry", () => {
  it("does not require redundant participant IDs for enrollment or group sessions", () => {
    expect(
      createAdHocSessionSchema.safeParse({
        enrollmentId: "enrollment-1",
        scheduledFor: "2026-08-24T17:00:00.000Z",
        durationMinutes: "60",
        studentIds: [],
      }).success,
    ).toBe(true);
    expect(
      createAdHocSessionSchema.safeParse({
        groupId: "group-1",
        scheduledFor: "2026-08-24T17:00:00.000Z",
        durationMinutes: "60",
        studentIds: [],
      }).success,
    ).toBe(true);
    expect(
      createAdHocSessionSchema.safeParse({
        scheduledFor: "2026-08-24T17:00:00.000Z",
        durationMinutes: "60",
        studentIds: [],
      }).success,
    ).toBe(false);
  });

  it("bounds assistant payroll ranges and result rows", () => {
    const payroll = getAssistantToolSpec(
      "tutors",
      "get_tutor_payroll",
      "OWNER",
    )!;
    expect(
      payroll.schema.safeParse({
        id: "tutor-1",
        from: "2026-01-01T00:00:00.000-08:00",
        to: "2026-12-31T00:00:00.000-08:00",
        limit: 100,
      }).success,
    ).toBe(true);
    expect(
      payroll.schema.safeParse({
        id: "tutor-1",
        from: "2025-01-01T00:00:00.000Z",
        to: "2026-12-31T00:00:00.000Z",
      }).success,
    ).toBe(false);
    expect(
      payroll.schema.safeParse({
        id: "tutor-1",
        from: "2026-02-01T00:00:00.000Z",
        to: "2026-01-01T00:00:00.000Z",
      }).success,
    ).toBe(false);
  });

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

  it("classifies exact guardian relationship inspection as read-only", () => {
    const guardian = getAssistantToolSpec(
      "guardians",
      "get_guardian",
      "STAFF",
    )!;
    expect(assistantToolMutatesData(guardian)).toBe(false);
  });

  it("supports filtered and pageable attendance participant verification", () => {
    const lookup = getAssistantToolSpec(
      "attendance",
      "get_session_participants",
      "STAFF",
    )!;
    expect(assistantToolMutatesData(lookup)).toBe(false);
    expect(lookup.schema.parse({ sessionId: "session-1" })).toEqual({
      sessionId: "session-1",
      page: 1,
      limit: 100,
    });
    expect(
      lookup.schema.safeParse({
        sessionId: "session-1",
        studentId: "student-101",
        page: 2,
        limit: 100,
      }).success,
    ).toBe(true);
    expect(
      lookup.schema.safeParse({ sessionId: "session-1", limit: 101 }).success,
    ).toBe(false);
  });

  it("supports bounded filtered session history beyond the current month", () => {
    const lookup = getAssistantToolSpec("schedule", "get_schedule", "STAFF")!;
    expect(
      lookup.schema.parse({
        from: "2026-08-01T00:00:00.000Z",
        to: "2027-08-01T00:00:00.000Z",
        studentId: "student-1",
        attendanceStatus: "COMPLETED",
        direction: "DESC",
        limit: 1,
      }),
    ).toMatchObject({
      page: 1,
      limit: 1,
      direction: "DESC",
    });
    expect(
      lookup.schema.safeParse({
        from: "2025-08-01T00:00:00.000Z",
        to: "2027-08-02T00:00:00.000Z",
      }).success,
    ).toBe(false);
    expect(
      lookup.schema.safeParse({
        month: "2026-08",
        studentId: "student-1",
      }).success,
    ).toBe(false);
  });

  it("does not expose internal avatar storage identifiers to the model", () => {
    for (const [namespace, name] of [
      ["students", "create_student"],
      ["students", "update_student"],
      ["guardians", "add_guardian"],
      ["guardians", "update_guardian"],
      ["tutors", "create_tutor"],
      ["tutors", "update_tutor"],
    ] as const) {
      const spec = getAssistantToolSpec(namespace, name, "OWNER");
      expect(spec).toBeDefined();
      expect(
        spec!.schema.safeParse({ avatarPublicId: "internal-id" }).success,
        `${namespace}.${name}`,
      ).toBe(false);
    }
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

  it("fails closed when classifying read tools versus mutations", () => {
    expect(
      assistantToolMutatesData({
        namespace: "students",
        name: "query_student_directory",
      }),
    ).toBe(false);
    expect(
      assistantToolMutatesData({
        namespace: "students",
        name: "create_student",
      }),
    ).toBe(true);
    expect(
      assistantToolMutatesData({ namespace: "future", name: "new_tool" }),
    ).toBe(true);
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
    expect(enrollmentSearch.schema.parse({})).toEqual({ page: 1, limit: 20 });
    expect(() => enrollmentSearch.schema.parse({ limit: 31 })).toThrow();

    const studentSearch = getAssistantToolSpec(
      "students",
      "search_students",
      "STAFF",
    )!;
    const tutorSearch = getAssistantToolSpec(
      "tutors",
      "search_tutors",
      "STAFF",
    )!;
    expect(studentSearch.schema.parse({})).toEqual({ page: 1, limit: 10 });
    expect(
      tutorSearch.schema.parse({ subjectId: "subject-1", page: 4 }),
    ).toEqual({
      subjectId: "subject-1",
      page: 4,
      limit: 10,
    });

    const studentDetail = getAssistantToolSpec(
      "students",
      "get_student",
      "STAFF",
    )!;
    const tutorDetail = getAssistantToolSpec("tutors", "get_tutor", "STAFF")!;
    expect(studentDetail.schema.parse({ id: "student-1" })).toEqual({
      id: "student-1",
      page: 1,
      limit: 20,
    });
    expect(tutorDetail.schema.parse({ id: "tutor-1", page: 2 })).toEqual({
      id: "tutor-1",
      page: 2,
      limit: 20,
    });
    expect(
      enrollmentSearch.schema.parse({ groupId: "group-1", page: 2 }),
    ).toEqual({ groupId: "group-1", page: 2, limit: 20 });
  });

  it("supports exact session and payment verification lookups", () => {
    const scheduleLookup = getAssistantToolSpec(
      "schedule",
      "get_schedule",
      "STAFF",
    )!;
    expect(scheduleLookup.schema.parse({ sessionId: "session-1" })).toEqual({
      sessionId: "session-1",
      page: 1,
      limit: 100,
      direction: "ASC",
    });
    expect(() => scheduleLookup.schema.parse({})).toThrow();

    const paymentLookup = getAssistantToolSpec(
      "billing",
      "list_payments",
      "STAFF",
    )!;
    expect(
      paymentLookup.schema.parse({ paymentId: "payment-1" }),
    ).toMatchObject({ paymentId: "payment-1" });

    expect(
      scheduleLookup.schema.safeParse({
        from: "2026-08-01T00:00:00-07:00",
        to: "2026-09-01T00:00:00-07:00",
      }).success,
    ).toBe(true);
    expect(
      paymentLookup.schema.safeParse({
        from: "2026-08-01T00:00:00-07:00",
        to: "2026-09-01T00:00:00-07:00",
      }).success,
    ).toBe(true);
    expect(
      paymentLookup.schema.safeParse({
        from: "2026-09-01T00:00:00-07:00",
        to: "2026-08-01T00:00:00-07:00",
      }).success,
    ).toBe(false);
    expect(
      paymentLookup.schema.safeParse({
        from: "2026-08-01T00:00:00",
        to: "2026-09-01T00:00:00",
      }).success,
    ).toBe(false);

    const enrollmentLookup = getAssistantToolSpec(
      "enrollments",
      "get_enrollment",
      "STAFF",
    )!;
    expect(enrollmentLookup.schema.parse({ discountId: "discount-1" })).toEqual(
      {
        discountId: "discount-1",
        discountPage: 1,
        discountLimit: 20,
      },
    );
    expect(
      enrollmentLookup.schema.parse({ id: "enrollment-1", discountPage: 3 }),
    ).toEqual({
      id: "enrollment-1",
      discountPage: 3,
      discountLimit: 20,
    });
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

  it("exposes bounded balance and recurrence lookups before mutations", () => {
    const balance = getAssistantToolSpec(
      "billing",
      "get_student_balance",
      "STAFF",
    )!;
    expect(balance.schema.parse({ studentId: "student-1" })).toEqual({
      studentId: "student-1",
    });

    const recurrenceList = getAssistantToolSpec(
      "recurrence",
      "list_recurring_schedules",
      "STAFF",
    )!;
    expect(
      recurrenceList.schema.parse({ enrollmentId: "enrollment-1" }),
    ).toEqual({
      enrollmentId: "enrollment-1",
      includeEnded: false,
      page: 1,
      limit: 20,
    });
    expect(() => recurrenceList.schema.parse({})).toThrow();
    expect(() =>
      recurrenceList.schema.parse({
        enrollmentId: "enrollment-1",
        groupId: "group-1",
      }),
    ).toThrow();

    const counts = getAssistantNamespaceCounts("OWNER");
    expect(counts.recurrence).toBe(9);
    expect(counts.billing).toBe(9);
    expect(counts.schedule).toBe(9);
  });

  it("supports bounded cohort email and payment-reminder batches", () => {
    const recipients = getAssistantToolSpec(
      "communications",
      "resolve_recipients",
      "STAFF",
    )!;
    expect(recipients.schema.parse({ status: "ACTIVE" })).toEqual({
      status: "ACTIVE",
      page: 1,
      limit: 100,
    });
    expect(recipients.schema.safeParse({}).success).toBe(false);
    expect(
      recipients.schema.safeParse({
        studentIds: Array.from(
          { length: 301 },
          (_, index) => `student-${index}`,
        ),
      }).success,
    ).toBe(false);
    expect(assistantToolMutatesData(recipients)).toBe(false);

    const dues = getAssistantToolSpec("billing", "get_upcoming_dues", "STAFF")!;
    expect(
      dues.schema.parse({
        status: "OVERDUE",
        fromMonth: "2025-09",
        toMonth: "2026-08",
        page: 2,
        limit: 100,
      }),
    ).toMatchObject({ page: 2, limit: 100 });
    expect(
      dues.schema.safeParse({ fromMonth: "2024-01", toMonth: "2026-08" })
        .success,
    ).toBe(false);
    expect(dues.schema.safeParse({ fromMonth: "2026-01" }).success).toBe(false);
    expect(dues.schema.safeParse({ toMonth: "2026-08" }).success).toBe(false);

    const reminders = getAssistantToolSpec(
      "billing",
      "send_payment_reminders",
      "STAFF",
    )!;
    const batch = Array.from({ length: 20 }, (_, index) => ({
      enrollmentId: `enrollment-${index}`,
      month: "2026-08",
    }));
    expect(reminders.schema.safeParse({ reminders: batch }).success).toBe(true);
    expect(
      reminders.schema.safeParse({ reminders: [batch[0], batch[0]] }).success,
    ).toBe(false);
    expect(assistantToolRequiresConfirmation(reminders, {})).toBe(true);
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

  it("normalizes oversized CRM text while preserving structural safety", () => {
    const normalized = normalizeAssistantResultCard({
      kind: "STUDENT",
      entityKey: `student:${"x".repeat(300)}`,
      title: "M".repeat(300),
      subtitle: "S".repeat(500),
      badges: Array.from({ length: 8 }, () => ({
        label: "B".repeat(120),
        tone: "NEUTRAL",
      })),
      fields: Array.from({ length: 9 }, () => ({
        label: "L".repeat(120),
        value: "V".repeat(400),
        icon: "USER",
      })),
      href: "/students",
      actionLabel: "A".repeat(200),
      suggestedActions: [],
    });

    expect(normalized).not.toBeNull();
    expect(normalized!.title).toHaveLength(160);
    expect(normalized!.fields).toHaveLength(6);
    expect(normalized!.fields[0].value).toHaveLength(240);
    expect(normalized!.badges).toHaveLength(4);
    expect(
      normalizeAssistantResultCard({
        kind: "STUDENT",
        entityKey: "student:1",
        title: "Maya",
        href: "https://example.com",
        actionLabel: "View",
      }),
    ).toBeNull();
  });
});
