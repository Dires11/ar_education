import { beforeEach, describe, expect, it, vi } from "vitest";

const emailData = vi.hoisted(() => ({
  getStudentsForEmail: vi.fn(),
}));
const emailUtility = vi.hoisted(() => ({ sendEmail: vi.fn() }));

vi.mock("@/lib/data/emails", () => ({
  createEmailTemplate: vi.fn(),
  deleteEmailTemplate: vi.fn(),
  getStudentsForEmail: emailData.getStudentsForEmail,
  listEmailTemplates: vi.fn(),
  updateEmailTemplate: vi.fn(),
}));
vi.mock("@/lib/utils/email", () => ({ sendEmail: emailUtility.sendEmail }));

import {
  getEmailDeliveryConfirmation,
  sendEmailToStudents,
} from "@/lib/services/emails";
import { DeliveryOutcomeUnknownError } from "@/lib/utils/email-errors";

function student(email: string) {
  return {
    id: "student-1",
    firstName: "Maya",
    lastName: "Chen",
    email: null,
    guardians: [
      {
        guardian: {
          firstName: "Ana",
          email,
        },
      },
    ],
    enrollments: [],
  };
}

describe("email approval integrity", () => {
  beforeEach(() => vi.clearAllMocks());

  it("refuses delivery when a resolved recipient changes after approval", async () => {
    emailData.getStudentsForEmail
      .mockResolvedValueOnce([student("approved@example.com")])
      .mockResolvedValueOnce([student("changed@example.com")]);
    const input = {
      studentIds: ["student-1"],
      subject: "Schedule",
      body: "Hello @guardian",
    };
    const confirmation = await getEmailDeliveryConfirmation(input);

    await expect(
      sendEmailToStudents({
        ...input,
        expectedConfirmationDigest: confirmation.digest,
      }),
    ).rejects.toThrow("changed after approval was requested");
    expect(emailUtility.sendEmail).not.toHaveBeenCalled();
  });

  it("does not convert a provider-ambiguous delivery into a safe failure", async () => {
    emailData.getStudentsForEmail.mockResolvedValue([
      student("approved@example.com"),
    ]);
    emailUtility.sendEmail.mockRejectedValue(
      new DeliveryOutcomeUnknownError("accepted, then timed out"),
    );

    await expect(
      sendEmailToStudents({
        studentIds: ["student-1"],
        subject: "Schedule",
        body: "Hello @guardian",
      }),
    ).rejects.toBeInstanceOf(DeliveryOutcomeUnknownError);
  });
});
