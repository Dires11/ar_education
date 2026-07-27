import { beforeEach, describe, expect, it, vi } from "vitest";

const studentMocks = vi.hoisted(() => ({
  createStudentWithGuardian: vi.fn(),
  getStudent: vi.fn(),
}));
const paymentDataMocks = vi.hoisted(() => ({
  getPaymentForAssistantConfirmation: vi.fn(),
  listPaymentsForAssistant: vi.fn(),
}));
const emailServiceMocks = vi.hoisted(() => ({
  sendEmailToStudents: vi.fn(),
}));

vi.mock("@/lib/data/students", () => ({
  getStudent: studentMocks.getStudent,
  listStudents: vi.fn(),
}));
vi.mock("@/lib/data/payments", () => paymentDataMocks);

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

vi.mock("@/lib/services/payments", () => ({
  deletePaymentById: vi.fn(),
  getPaymentStats: vi.fn(),
  getUpcomingPaymentDues: vi.fn(),
  recordPayment: vi.fn(),
  recordPaymentForDue: vi.fn(),
  sendPaymentReminderEmail: vi.fn(),
}));

vi.mock("@/lib/services/emails", () => ({
  createTemplate: vi.fn(),
  deleteTemplate: vi.fn(),
  listEmailTemplates: vi.fn(),
  sendEmailToStudents: emailServiceMocks.sendEmailToStudents,
  updateTemplate: vi.fn(),
}));

import {
  executeAssistantTool,
  getAssistantConfirmationCard,
} from "@/lib/services/assistant/executor";

describe("assistant tool result cards", () => {
  beforeEach(() => {
    vi.clearAllMocks();
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
      },
      context: {
        admin: { id: "admin-1", role: "STAFF" },
        idempotencyKey: "tool-run-1",
      },
    });

    expect(emailServiceMocks.sendEmailToStudents).toHaveBeenCalledWith({
      studentIds: ["student-1"],
      subject: "Schedule",
      body: "Hello",
      idempotencyKey: "tool-run-1",
    });
  });
});
