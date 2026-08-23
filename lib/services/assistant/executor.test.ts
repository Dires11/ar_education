import { beforeEach, describe, expect, it, vi } from "vitest";

const studentMocks = vi.hoisted(() => ({
  createStudentWithGuardian: vi.fn(),
  getStudent: vi.fn(),
}));
const paymentDataMocks = vi.hoisted(() => ({
  getPaymentForAssistantConfirmation: vi.fn(),
  listPaymentsForAssistant: vi.fn(),
}));
const sessionDataMocks = vi.hoisted(() => ({
  getRecurrenceRuleWithParticipants: vi.fn(),
  getSession: vi.fn(),
}));
const sessionServiceMocks = vi.hoisted(() => ({
  getEnrollmentMonthSummary: vi.fn(),
  getRecurringSchedulePreview: vi.fn(),
  listRecurrenceRulesForAssistant: vi.fn(),
}));
const paymentServiceMocks = vi.hoisted(() => ({
  getPaymentDueQuote: vi.fn(),
  getPaymentReminderConfirmation: vi.fn(),
  getStudentBalance: vi.fn(),
  recordPayment: vi.fn(),
  recordPaymentForDue: vi.fn(),
}));
const emailServiceMocks = vi.hoisted(() => ({
  getEmailDeliveryConfirmation: vi.fn(),
  sendEmailToStudents: vi.fn(),
}));
const referenceDataMocks = vi.hoisted(() => ({
  getTutor: vi.fn(),
  getSubject: vi.fn(),
  getPackage: vi.fn(),
  getEnrollment: vi.fn(),
  listGroups: vi.fn(),
}));

vi.mock("@/lib/data/students", () => ({
  getStudent: studentMocks.getStudent,
  listStudents: vi.fn(),
}));
vi.mock("@/lib/data/payments", () => paymentDataMocks);
vi.mock("@/lib/data/sessions", () => sessionDataMocks);
vi.mock("@/lib/data/tutors", () => ({
  getTutor: referenceDataMocks.getTutor,
  listTutors: vi.fn(),
}));
vi.mock("@/lib/data/subjects", () => ({
  getSubject: referenceDataMocks.getSubject,
  listSubjects: vi.fn(),
}));
vi.mock("@/lib/data/packages", () => ({
  getPackage: referenceDataMocks.getPackage,
  listPackages: vi.fn(),
}));
vi.mock("@/lib/data/enrollments", () => ({
  getDiscountWithEnrollment: vi.fn(),
  getEnrollment: referenceDataMocks.getEnrollment,
  searchEnrollmentsForAssistant: vi.fn(),
}));
vi.mock("@/lib/data/groups", () => ({
  listGroups: referenceDataMocks.listGroups,
}));

vi.mock("@/lib/services/students", () => ({
  addGuardianToStudent: vi.fn(),
  archiveStudentById: vi.fn(),
  createStudentWithGuardian: studentMocks.createStudentWithGuardian,
  deleteStudentById: vi.fn(),
  queryStudentDirectory: vi.fn(),
  removeGuardianFromStudent: vi.fn(),
  updateGuardianDetails: vi.fn(),
  updateStudentProfile: vi.fn(),
  updateStudentStatusById: vi.fn(),
}));

vi.mock("@/lib/services/sessions", () => ({
  cancelSessionById: vi.fn(),
  cancelVirtualOccurrence: vi.fn(),
  createAdHocSession: vi.fn(),
  createRecurringSchedule: vi.fn(),
  deleteRecurringSchedule: vi.fn(),
  deleteSessionById: vi.fn(),
  endRecurrenceFromDate: vi.fn(),
  getEnrollmentMonthSummary: sessionServiceMocks.getEnrollmentMonthSummary,
  getRecurringSchedulePreview: sessionServiceMocks.getRecurringSchedulePreview,
  listRecurrenceRulesForAssistant:
    sessionServiceMocks.listRecurrenceRulesForAssistant,
  getMonthSchedule: vi.fn(),
  markSessionAttendance: vi.fn(),
  rescheduleVirtualOccurrence: vi.fn(),
  splitRecurrenceRule: vi.fn(),
  updateEnrollmentRecurrenceColor: vi.fn(),
  updateScheduledSession: vi.fn(),
  updateSessionStatus: vi.fn(),
}));

vi.mock("@/lib/services/payments", () => ({
  deletePaymentById: vi.fn(),
  getPaymentDueQuote: paymentServiceMocks.getPaymentDueQuote,
  getPaymentReminderConfirmation:
    paymentServiceMocks.getPaymentReminderConfirmation,
  getStudentBalance: paymentServiceMocks.getStudentBalance,
  getPaymentStats: vi.fn(),
  getUpcomingPaymentDues: vi.fn(),
  recordPayment: paymentServiceMocks.recordPayment,
  recordPaymentForDue: paymentServiceMocks.recordPaymentForDue,
  sendPaymentReminderEmail: vi.fn(),
}));

vi.mock("@/lib/services/emails", () => ({
  createTemplate: vi.fn(),
  deleteTemplate: vi.fn(),
  listEmailTemplates: vi.fn(),
  getEmailDeliveryConfirmation: emailServiceMocks.getEmailDeliveryConfirmation,
  sendEmailToStudents: emailServiceMocks.sendEmailToStudents,
  updateTemplate: vi.fn(),
}));

import {
  collectAssistantIdentifierValues,
  enrichAssistantConfirmationCard,
  executeAssistantTool,
  getAssistantConfirmationCard,
  getAssistantMutationDraftCard,
  resolveAssistantConfirmationArguments,
} from "@/lib/services/assistant/executor";

describe("assistant tool result cards", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("collects only non-empty CRM business references", () => {
    expect(
      collectAssistantIdentifierValues({
        id: "student-1",
        subjectId: "",
        avatarPublicId: "cloudinary-internal-id",
        nested: { paymentId: "payment-1" },
      }),
    ).toEqual(["student-1", "payment-1"]);
  });

  it("returns a student card with modal deep-link and next-step prompts", async () => {
    const student = {
      id: "student-1",
      firstName: "Test",
      lastName: "Student",
      avatarUrl: null,
      createdAt: new Date("2026-07-26T12:00:00.000Z"),
      status: "ACTIVE",
      dob: new Date("2015-01-19T00:00:00.000Z"),
      school: null,
      gradeLevel: null,
      guardians: [],
      enrollments: [],
    };
    studentMocks.createStudentWithGuardian.mockResolvedValue(student);
    studentMocks.getStudent.mockResolvedValue(student);

    const result = await executeAssistantTool({
      namespace: "students",
      name: "create_student",
      argumentsValue: {
        firstName: "Test",
        lastName: "Student",
        dob: "2015-01-19",
      },
      context: { admin: { id: "admin-1", role: "STAFF" } },
    });

    expect(result).toMatchObject({
      ok: true,
      href: "/students?student=student-1",
      card: {
        kind: "STUDENT",
        entityKey: "student:student-1",
        title: "Test Student",
        href: "/students?student=student-1",
        fields: expect.arrayContaining([
          expect.objectContaining({
            label: "Guardian",
            value: "No guardian added",
          }),
        ]),
        suggestedActions: expect.arrayContaining([
          {
            kind: "PROMPT",
            label: "Add guardian",
            prompt: "Add a guardian for Test Student.",
          },
          expect.objectContaining({
            kind: "PROMPT",
            label: "Enroll in a package",
          }),
        ]),
      },
    });
  });

  it("keeps a committed mutation successful when card enrichment fails", async () => {
    studentMocks.createStudentWithGuardian.mockResolvedValue({
      id: "student-1",
    });
    studentMocks.getStudent.mockRejectedValue(new Error("read unavailable"));

    await expect(
      executeAssistantTool({
        namespace: "students",
        name: "create_student",
        argumentsValue: {
          firstName: "Test",
          lastName: "Student",
          dob: "2015-01-19",
        },
        context: { admin: { id: "admin-1", role: "STAFF" } },
      }),
    ).resolves.toMatchObject({
      ok: true,
      data: { id: "student-1" },
      href: "/students?student=student-1",
    });

    expect(studentMocks.createStudentWithGuardian).toHaveBeenCalledTimes(1);
  });

  it("resolves a student record card before a destructive confirmation", async () => {
    const student = {
      id: "student-1",
      firstName: "Test",
      lastName: "Student",
      avatarUrl: null,
      createdAt: new Date("2026-07-26T12:00:00.000Z"),
      status: "ACTIVE",
      dob: new Date("2015-01-19T00:00:00.000Z"),
      school: null,
      gradeLevel: null,
      guardians: [],
      enrollments: [],
    };
    studentMocks.getStudent.mockResolvedValue(student);

    const card = await getAssistantConfirmationCard({
      namespace: "students",
      name: "delete_student",
      argumentsValue: { id: "student-1" },
    });

    expect(card).toMatchObject({
      kind: "STUDENT",
      entityKey: "student:student-1",
      title: "Test Student",
      subtitle: "Student selected for permanent deletion",
      href: "/students?student=student-1",
    });
  });

  it("builds a readable draft card when an untrusted create has no record yet", async () => {
    const card = await getAssistantMutationDraftCard(
      {
        namespace: "students",
        name: "create_student",
        description: "Create one student.",
      },
      {
        firstName: "Maya",
        lastName: "Chen",
        dob: "2012-04-08",
      },
    );

    expect(card).toMatchObject({
      kind: "STUDENT",
      title: "Maya Chen",
      subtitle: "Proposed change derived from untrusted evidence",
      href: "/students",
    });
    expect(JSON.stringify(card)).not.toContain("studentId");
  });

  it("replaces a model-supplied due amount with the current outstanding amount", async () => {
    paymentServiceMocks.getPaymentDueQuote.mockResolvedValue({
      confirmationArguments: {
        enrollmentId: "enrollment-1",
        studentId: "student-1",
        amount: "87.50",
        method: "CARD",
        month: "2026-08",
      },
    });

    await expect(
      resolveAssistantConfirmationArguments({
        namespace: "billing",
        name: "mark_due_paid",
        argumentsValue: {
          enrollmentId: "enrollment-1",
          studentId: "student-1",
          amount: "120",
          method: "CARD",
          month: "2026-08",
        },
      }),
    ).resolves.toEqual(
      expect.objectContaining({ amount: "87.50", month: "2026-08" }),
    );
  });

  it("binds an outbound email approval to resolved recipient addresses", async () => {
    emailServiceMocks.getEmailDeliveryConfirmation.mockResolvedValue({
      digest: "a".repeat(64),
      bodyPreview:
        "Maya Chen — guardian@example.com\nSubject: Schedule\nHello Ana",
      recipients: [
        {
          studentId: "student-1",
          name: "Maya Chen",
          email: "guardian@example.com",
        },
      ],
    });

    const resolved = await resolveAssistantConfirmationArguments({
      namespace: "communications",
      name: "send_email",
      argumentsValue: {
        studentIds: ["student-1"],
        subject: "Schedule",
        body: "Hello @guardian",
      },
    });

    expect(resolved).toMatchObject({
      messagePreview:
        "Maya Chen — guardian@example.com\nSubject: Schedule\nHello Ana",
      recipientPreview: ["Maya Chen — guardian@example.com"],
      __assistantConfirmation: {
        digest: "a".repeat(64),
        recipientSummary: "Maya Chen — guardian@example.com",
        subject: "Schedule",
      },
    });
    await expect(
      getAssistantConfirmationCard({
        namespace: "communications",
        name: "send_email",
        argumentsValue: resolved,
      }),
    ).resolves.toMatchObject({
      kind: "EMAIL",
      fields: expect.arrayContaining([
        expect.objectContaining({
          label: "Recipients",
          value: "Maya Chen — guardian@example.com",
        }),
        expect.objectContaining({
          label: "Message",
          value: expect.stringContaining("Hello Ana"),
        }),
      ]),
    });
  });

  it("resolves referenced people in an untrusted draft and refuses generic existing-target fallbacks", async () => {
    studentMocks.getStudent.mockResolvedValue({
      id: "student-1",
      firstName: "Maya",
      lastName: "Chen",
    });
    const card = await getAssistantMutationDraftCard(
      {
        namespace: "guardians",
        name: "add_guardian",
        description: "Add a guardian.",
      },
      {
        studentId: "student-1",
        firstName: "Ana",
        lastName: "Chen",
      },
    );
    expect(card?.fields).toContainEqual({
      label: "Student",
      value: "Maya Chen",
      icon: "USER",
    });
    await expect(
      getAssistantMutationDraftCard(
        {
          namespace: "students",
          name: "update_student",
          description: "Update a student.",
        },
        { id: "student-1", school: "North High" },
      ),
    ).resolves.toBeUndefined();
  });

  it("shows every resolved enrollment target before an evidence-derived create", async () => {
    studentMocks.getStudent.mockResolvedValue({
      id: "student-1",
      firstName: "Maya",
      lastName: "Chen",
    });
    referenceDataMocks.getTutor.mockResolvedValue({
      id: "tutor-1",
      firstName: "Theo",
      lastName: "Grant",
    });
    referenceDataMocks.getSubject.mockResolvedValue({
      id: "subject-1",
      name: "Mathematics",
    });
    referenceDataMocks.getPackage.mockResolvedValue({
      id: "package-1",
      name: "Private Math",
    });

    const card = await getAssistantMutationDraftCard(
      {
        namespace: "enrollments",
        name: "create_enrollment",
        description: "Create an enrollment.",
      },
      {
        studentId: "student-1",
        tutorId: "tutor-1",
        subjectId: "subject-1",
        packageId: "package-1",
        startDate: "2026-09-01",
      },
    );

    expect(card?.fields).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ label: "Student", value: "Maya Chen" }),
        expect.objectContaining({ label: "Tutor", value: "Theo Grant" }),
        expect.objectContaining({ label: "Subject", value: "Mathematics" }),
        expect.objectContaining({ label: "Package", value: "Private Math" }),
      ]),
    );
  });

  it("shows selected replacement subjects alongside current card values", async () => {
    referenceDataMocks.getSubject.mockResolvedValue({
      id: "subject-geometry",
      name: "Geometry",
    });
    const card = await enrichAssistantConfirmationCard(
      {
        kind: "TUTOR",
        entityKey: "tutor:tutor-1",
        title: "Theo Grant",
        badges: [],
        fields: [{ label: "Subjects", value: "Algebra", icon: "BOOK" }],
        href: "/tutors/tutor-1",
        actionLabel: "View tutor",
        suggestedActions: [],
      },
      { id: "tutor-1", subjectIds: ["subject-geometry"] },
    );

    expect(card.fields).toEqual([
      { label: "Selected subject", value: "Geometry", icon: "BOOK" },
      { label: "Subjects", value: "Algebra", icon: "BOOK" },
    ]);
  });

  it("keeps all referenced targets ahead of optional card details", async () => {
    studentMocks.getStudent.mockResolvedValue({
      id: "student-1",
      firstName: "Maya",
      lastName: "Chen",
    });
    referenceDataMocks.getTutor.mockResolvedValue({
      id: "tutor-1",
      firstName: "Theo",
      lastName: "Grant",
    });
    referenceDataMocks.getSubject.mockResolvedValue({
      id: "subject-1",
      name: "Mathematics",
    });
    referenceDataMocks.getEnrollment.mockResolvedValue({
      id: "enrollment-1",
      student: { firstName: "Maya", lastName: "Chen" },
      subject: { name: "Mathematics" },
    });

    const card = await enrichAssistantConfirmationCard(
      {
        kind: "SESSION",
        entityKey: "draft-session",
        title: "New session",
        badges: [],
        fields: [
          { label: "Date", value: "August 24", icon: "CALENDAR" },
          { label: "Duration", value: "60 minutes", icon: "CLOCK" },
          { label: "Room", value: "A", icon: "LOCATION" },
        ],
        href: "/schedule",
        actionLabel: "View schedule",
        suggestedActions: [],
      },
      {
        studentId: "student-1",
        tutorId: "tutor-1",
        subjectId: "subject-1",
        enrollmentId: "enrollment-1",
      },
    );

    expect(card.fields.map((field) => field.label)).toEqual([
      "Student",
      "Tutor",
      "Subject",
      "Enrollment",
      "Date",
      "Duration",
    ]);
  });

  it("shows the rendered payment-reminder body before approval", async () => {
    paymentServiceMocks.getPaymentReminderConfirmation.mockResolvedValue({
      digest: "b".repeat(64),
      recipientEmail: "guardian@example.com",
      recipientName: "Maya Chen",
      amount: "80.00",
      monthLabel: "August 2026",
      subject: "Math payment reminder",
      bodyPreview: "Hello Ana. Maya's Math balance is $80.00.",
    });

    const resolved = await resolveAssistantConfirmationArguments({
      namespace: "billing",
      name: "send_payment_reminder",
      argumentsValue: {
        enrollmentId: "enrollment-1",
        month: "2026-08",
      },
    });
    expect(resolved).toMatchObject({
      messagePreview: "Hello Ana. Maya's Math balance is $80.00.",
      __assistantConfirmation: {
        digest: "b".repeat(64),
        bodyPreview: "Hello Ana. Maya's Math balance is $80.00.",
      },
    });
    await expect(
      getAssistantConfirmationCard({
        namespace: "billing",
        name: "send_payment_reminder",
        argumentsValue: resolved,
      }),
    ).resolves.toMatchObject({
      kind: "EMAIL",
      fields: expect.arrayContaining([
        expect.objectContaining({
          label: "Message",
          value: "Hello Ana. Maya's Math balance is $80.00.",
        }),
      ]),
    });
  });

  it("keeps the full resolved recipient set visible for bulk-email approval", async () => {
    const recipients = Array.from({ length: 4 }, (_, index) => ({
      studentId: `student-${index + 1}`,
      name: `Student ${index + 1}`,
      email: `guardian${index + 1}@example.com`,
    }));
    emailServiceMocks.getEmailDeliveryConfirmation.mockResolvedValue({
      digest: "c".repeat(64),
      bodyPreview: "Student 1 — guardian1@example.com\nSubject: Notice\nHello",
      recipients,
    });

    const resolved = await resolveAssistantConfirmationArguments({
      namespace: "communications",
      name: "send_email",
      argumentsValue: {
        studentIds: recipients.map((recipient) => recipient.studentId),
        subject: "Notice",
        body: "Hello",
      },
    });

    expect(resolved).toMatchObject({
      recipientPreview: recipients.map(
        (recipient) => `${recipient.name} — ${recipient.email}`,
      ),
      __assistantConfirmation: {
        recipientSummary: expect.stringContaining("and 1 more"),
      },
    });
  });

  it("pairs every attendance decision with the resolved student name", async () => {
    studentMocks.getStudent
      .mockResolvedValueOnce({ firstName: "Maya", lastName: "Chen" })
      .mockResolvedValueOnce({ firstName: "Noah", lastName: "Patel" });

    const resolved = await resolveAssistantConfirmationArguments({
      namespace: "schedule",
      name: "mark_attendance",
      argumentsValue: {
        sessionId: "session-1",
        attendances: [
          { studentId: "student-1", status: "COMPLETED", billable: true },
          { studentId: "student-2", status: "NO_SHOW", billable: false },
        ],
      },
    });

    expect(resolved).toMatchObject({
      attendancePreview: [
        { student: "Maya Chen", status: "Completed", billable: true },
        { student: "Noah Patel", status: "No Show", billable: false },
      ],
    });
  });

  it("uses action-specific confirmation copy for routine evidence changes", async () => {
    studentMocks.getStudent.mockResolvedValue({
      id: "student-1",
      guardians: [
        {
          guardianId: "guardian-1",
          guardian: {
            id: "guardian-1",
            firstName: "Ana",
            lastName: "Chen",
            email: "ana@example.com",
            phone: "555-0100",
            relationship: "PARENT",
          },
        },
      ],
    });
    referenceDataMocks.getTutor.mockResolvedValue({
      id: "tutor-1",
      firstName: "Theo",
      lastName: "Grant",
      avatarUrl: null,
      status: "ACTIVE",
      email: "theo@example.com",
      phone: "555-0101",
      hourlyRate: "45",
      subjects: [],
    });
    referenceDataMocks.getPackage.mockResolvedValue({
      id: "package-1",
      name: "Math Monthly",
      type: "MONTHLY",
      lessonType: "PRIVATE",
      basePrice: "200",
      durationMinutes: 60,
      isActive: true,
      subject: null,
    });

    await expect(
      getAssistantConfirmationCard({
        namespace: "guardians",
        name: "update_guardian",
        argumentsValue: {
          studentId: "student-1",
          guardianId: "guardian-1",
        },
      }),
    ).resolves.toMatchObject({ subtitle: "Guardian affected by this change" });
    await expect(
      getAssistantConfirmationCard({
        namespace: "tutors",
        name: "set_tutor_subjects",
        argumentsValue: { id: "tutor-1", subjectIds: ["subject-1"] },
      }),
    ).resolves.toMatchObject({
      subtitle: "Tutor subject assignment affected by this change",
    });
    await expect(
      getAssistantConfirmationCard({
        namespace: "catalog",
        name: "update_package",
        argumentsValue: { id: "package-1", name: "Updated" },
      }),
    ).resolves.toMatchObject({ subtitle: "Package affected by this change" });
  });

  it("shows the guardian, not a database ID, for relationship removal", async () => {
    studentMocks.getStudent.mockResolvedValue({
      id: "student-1",
      guardians: [
        {
          guardianId: "guardian-1",
          guardian: {
            id: "guardian-1",
            firstName: "Ana",
            lastName: "Chen",
            avatarUrl: null,
            email: "ana@example.com",
            phone: "555-0100",
            relationship: "GUARDIAN",
          },
        },
      ],
    });

    const card = await getAssistantConfirmationCard({
      namespace: "guardians",
      name: "remove_guardian",
      argumentsValue: {
        studentId: "student-1",
        guardianId: "guardian-1",
      },
    });

    expect(card).toMatchObject({
      kind: "GUARDIAN",
      entityKey: "guardian:guardian-1",
      title: "Ana Chen",
      href: "/students?student=student-1",
    });

    await expect(
      getAssistantConfirmationCard({
        namespace: "guardians",
        name: "remove_guardian",
        argumentsValue: {
          studentId: "student-1",
          guardianId: "guardian-from-another-student",
        },
      }),
    ).resolves.toBeUndefined();
  });

  it("shows the payment and student before permanent payment deletion", async () => {
    paymentDataMocks.getPaymentForAssistantConfirmation.mockResolvedValue({
      id: "payment-1",
      amount: "120",
      method: "CARD",
      paidAt: new Date("2026-07-26T12:00:00.000Z"),
      coversMonth: "2026-07",
      student: {
        id: "student-1",
        firstName: "Maya",
        lastName: "Chen",
        avatarUrl: null,
        createdAt: new Date("2026-01-01T00:00:00.000Z"),
        status: "ACTIVE",
        dob: null,
        school: null,
        gradeLevel: null,
        guardians: [],
        enrollments: [],
      },
    });

    const card = await getAssistantConfirmationCard({
      namespace: "billing",
      name: "delete_payment",
      argumentsValue: { paymentId: "payment-1" },
    });

    expect(card).toMatchObject({
      kind: "PAYMENT",
      entityKey: "payment:payment-1",
      title: "Maya Chen payment",
      subtitle: "Payment selected for permanent deletion",
      badges: [{ label: "Permanent action", tone: "DESTRUCTIVE" }],
    });
  });

  it("supports exact session and payment lookups needed before mutations", async () => {
    sessionDataMocks.getSession.mockResolvedValue({
      id: "session-1",
      scheduledFor: new Date("2026-08-24T18:00:00.000Z"),
      durationMinutes: 60,
      room: "A",
    });
    paymentDataMocks.listPaymentsForAssistant.mockResolvedValue({
      payments: [{ id: "payment-1", amount: "120" }],
      total: 1,
      page: 1,
      pageSize: 20,
    });

    await expect(
      executeAssistantTool({
        namespace: "schedule",
        name: "get_schedule",
        argumentsValue: { sessionId: "session-1" },
        context: { admin: { id: "admin-1", role: "STAFF" } },
      }),
    ).resolves.toMatchObject({
      ok: true,
      card: {
        entityKey: "session:session-1",
        title: "Scheduled session",
        fields: expect.arrayContaining([
          expect.objectContaining({
            label: "Date & time",
            value: "Aug 24, 2026, 11:00 AM",
          }),
        ]),
      },
    });
    await executeAssistantTool({
      namespace: "billing",
      name: "list_payments",
      argumentsValue: { paymentId: "payment-1", limit: 20 },
      context: { admin: { id: "admin-1", role: "STAFF" } },
    });
    expect(paymentDataMocks.listPaymentsForAssistant).toHaveBeenCalledWith(
      expect.objectContaining({ paymentId: "payment-1" }),
    );
  });

  it("passes a deterministic idempotency key to outbound email", async () => {
    emailServiceMocks.sendEmailToStudents.mockResolvedValue({
      sent: 1,
      failed: 0,
      results: [],
    });

    await executeAssistantTool({
      namespace: "communications",
      name: "send_email",
      argumentsValue: {
        studentIds: ["student-1"],
        subject: "Schedule",
        body: "Hello",
        __assistantConfirmation: {
          digest: "a".repeat(64),
          recipientSummary: "Maya Chen — guardian@example.com",
          subject: "Schedule",
        },
      },
      context: {
        admin: { id: "admin-1", role: "STAFF" },
        idempotencyKey: "tool-run-1",
        provenanceValidated: true,
      },
    });

    expect(emailServiceMocks.sendEmailToStudents).toHaveBeenCalledWith({
      studentIds: ["student-1"],
      subject: "Schedule",
      body: "Hello",
      idempotencyKey: "tool-run-1",
      expectedConfirmationDigest: "a".repeat(64),
    });
  });

  it("returns a student balance card from a single bounded lookup", async () => {
    studentMocks.getStudent.mockResolvedValue({
      id: "student-1",
      firstName: "Maya",
      lastName: "Chen",
      avatarUrl: null,
      createdAt: new Date("2026-01-01T00:00:00.000Z"),
      status: "ACTIVE",
      dob: null,
      school: null,
      gradeLevel: null,
      guardians: [],
      enrollments: [],
    });
    paymentServiceMocks.getStudentBalance.mockResolvedValue(42.5);

    const result = await executeAssistantTool({
      namespace: "billing",
      name: "get_student_balance",
      argumentsValue: { studentId: "student-1" },
      context: { admin: { id: "admin-1", role: "STAFF" } },
    });

    expect(paymentServiceMocks.getStudentBalance).toHaveBeenCalledWith(
      "student-1",
    );
    expect(result).toMatchObject({
      data: { studentId: "student-1", balance: "42.50" },
      href: "/students?student=student-1",
      card: { kind: "STUDENT", title: "Maya Chen" },
    });
  });

  it("lists and inspects recurring schedules so mutations can use rule IDs", async () => {
    sessionServiceMocks.listRecurrenceRulesForAssistant.mockResolvedValue([
      { id: "rule-1", dayOfWeek: 1 },
    ]);
    const rule = {
      id: "rule-1",
      dayOfWeek: 1,
      startTime: "15:30",
      durationMinutes: 60,
      startsOn: new Date("2026-08-10T00:00:00.000Z"),
      enrollment: {
        student: { firstName: "Maya", lastName: "Chen" },
        subject: { name: "Math" },
      },
      group: null,
    };
    sessionDataMocks.getRecurrenceRuleWithParticipants.mockResolvedValue(rule);

    const listResult = await executeAssistantTool({
      namespace: "recurrence",
      name: "list_recurring_schedules",
      argumentsValue: { enrollmentId: "enrollment-1" },
      context: { admin: { id: "admin-1", role: "STAFF" } },
    });
    const detailResult = await executeAssistantTool({
      namespace: "recurrence",
      name: "get_recurring_schedule",
      argumentsValue: { ruleId: "rule-1" },
      context: { admin: { id: "admin-1", role: "STAFF" } },
    });

    expect(listResult).toMatchObject({
      data: [{ id: "rule-1", dayOfWeek: 1 }],
      href: "/schedule",
    });
    expect(
      sessionServiceMocks.listRecurrenceRulesForAssistant,
    ).toHaveBeenCalledWith({
      enrollmentId: "enrollment-1",
      groupId: undefined,
      includeEnded: false,
      limit: 20,
    });
    expect(detailResult).toMatchObject({
      data: { id: "rule-1" },
      card: { entityKey: "recurrence:rule-1", title: "Maya Chen · Math" },
    });
  });

  it("previews schedule capacity and recurrence proposals without writing", async () => {
    sessionServiceMocks.getEnrollmentMonthSummary.mockResolvedValue({
      sessionsPerWeek: 8,
      totalPlanned: 2,
      remaining: 6,
      periodLabel: "Week of Aug 9",
      isOverLimit: false,
    });
    sessionServiceMocks.getRecurringSchedulePreview.mockResolvedValue({
      hasLimit: true,
      sessionsPerWeek: 8,
      proposedSessions: 8,
      materializableSessions: 6,
      firstExceededDate: "2026-08-31T00:00:00.000Z",
      suggestedEndsOn: "2026-08-30",
      periodLabel: "week of Aug 30",
      existingPlannedInWeek: 2,
    });

    const capacity = await executeAssistantTool({
      namespace: "schedule",
      name: "get_enrollment_capacity",
      argumentsValue: {
        enrollmentId: "enrollment-1",
        date: "2026-08-10T12:00:00.000Z",
      },
      context: { admin: { id: "admin-1", role: "STAFF" } },
    });
    const preview = await executeAssistantTool({
      namespace: "schedule",
      name: "preview_recurring_schedule",
      argumentsValue: {
        enrollmentId: "enrollment-1",
        daysOfWeek: ["1"],
        startTime: "15:30",
        durationMinutes: "60",
        startsOn: "2026-08-10",
      },
      context: { admin: { id: "admin-1", role: "STAFF" } },
    });

    expect(sessionServiceMocks.getEnrollmentMonthSummary).toHaveBeenCalledWith(
      "enrollment-1",
      new Date("2026-08-10T12:00:00.000Z"),
    );
    expect(
      sessionServiceMocks.getRecurringSchedulePreview,
    ).toHaveBeenCalledWith(
      expect.objectContaining({
        enrollmentId: "enrollment-1",
        startsOn: "2026-08-10",
      }),
    );
    expect(capacity).toMatchObject({
      data: { sessionsPerWeek: 8, totalPlanned: 2, remaining: 6 },
      href: "/schedule",
    });
    expect(preview).toMatchObject({
      data: { proposedSessions: 8, materializableSessions: 6 },
      href: "/schedule",
    });
  });

  it("passes the tool-run idempotency key to financial writes", async () => {
    const payment = {
      id: "payment-1",
      amount: "120",
      method: "CARD",
      paidAt: new Date("2026-08-08T00:00:00.000Z"),
    };
    paymentServiceMocks.recordPayment.mockResolvedValue(payment);
    studentMocks.getStudent.mockResolvedValue({
      id: "student-1",
      firstName: "Maya",
      lastName: "Chen",
      avatarUrl: null,
      createdAt: new Date("2026-01-01T00:00:00.000Z"),
      status: "ACTIVE",
      dob: null,
      school: null,
      gradeLevel: null,
      guardians: [],
      enrollments: [],
    });

    await executeAssistantTool({
      namespace: "billing",
      name: "record_payment",
      argumentsValue: {
        studentId: "student-1",
        amount: "120",
        method: "CARD",
        paidAt: "2026-08-08",
      },
      context: {
        admin: { id: "admin-1", role: "STAFF" },
        idempotencyKey: "tool-run-1",
        provenanceValidated: true,
      },
    });

    expect(paymentServiceMocks.recordPayment).toHaveBeenCalledWith(
      expect.objectContaining({ studentId: "student-1" }),
      "admin-1",
      "tool-run-1",
    );
  });
});
