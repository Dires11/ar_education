import { beforeEach, describe, expect, it, vi } from "vitest";

const studentMocks = vi.hoisted(() => ({
  createStudentWithGuardian: vi.fn(),
  getStudent: vi.fn(),
}));

vi.mock("@/lib/data/students", () => ({
  getStudent: studentMocks.getStudent,
  listStudents: vi.fn(),
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
  sendEmailToStudents: vi.fn(),
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
});
