import { beforeEach, describe, expect, it, vi } from "vitest";
import { Prisma } from "@/generated/prisma";

const paymentData = vi.hoisted(() => ({
  createOutstandingPaymentForPeriod: vi.fn(),
  getEnrollmentForPaymentReminder: vi.fn(),
  getEnrollmentPaymentDueQuote: vi.fn(),
}));
const emailData = vi.hoisted(() => ({
  createEmailTemplate: vi.fn(),
  getLatestEmailTemplate: vi.fn(),
}));
const emailUtility = vi.hoisted(() => ({ sendEmail: vi.fn() }));

vi.mock("@/lib/data/payments", () => paymentData);
vi.mock("@/lib/data/emails", () => emailData);
vi.mock("@/lib/utils/email", () => ({ sendEmail: emailUtility.sendEmail }));

import {
  getPaymentDueQuote,
  getPaymentReminderConfirmation,
  recordPaymentForDue,
  sendPaymentReminderEmail,
} from "@/lib/services/payments";

function enrollmentWithPaidAmount(paid: number) {
  return {
    id: "enrollment-1",
    studentId: "student-1",
    startDate: new Date("2026-01-01T00:00:00.000Z"),
    endDate: null,
    status: "ACTIVE" as const,
    updatedAt: new Date("2026-01-01T00:00:00.000Z"),
    priceAtEnrollment: new Prisma.Decimal(100),
    customPriceOverride: null,
    package: { type: "MONTHLY" as const, billingPeriod: "MONTHLY" as const },
    discounts: [],
    payments: [{ amount: new Prisma.Decimal(paid) }],
  };
}

describe("payment due confirmation integrity", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("quotes the server-calculated outstanding amount for confirmation", async () => {
    paymentData.getEnrollmentPaymentDueQuote.mockResolvedValue(
      enrollmentWithPaidAmount(20),
    );

    const quote = await getPaymentDueQuote({
      enrollmentId: "enrollment-1",
      studentId: "student-1",
      amount: "120",
      method: "CARD",
      month: "2026-08",
    });

    expect(quote.parsed.amount).toBe("120");
    expect(quote.confirmationArguments.amount).toBe("80.00");
  });

  it("keeps the approved amount as the atomic execution precondition", async () => {
    paymentData.getEnrollmentPaymentDueQuote.mockResolvedValue(
      enrollmentWithPaidAmount(30),
    );
    paymentData.createOutstandingPaymentForPeriod.mockResolvedValue({
      id: "payment-1",
    });

    await recordPaymentForDue(
      {
        enrollmentId: "enrollment-1",
        studentId: "student-1",
        amount: "80.00",
        method: "CARD",
        month: "2026-08",
      },
      "admin-1",
      "tool-run-1",
    );

    expect(paymentData.createOutstandingPaymentForPeriod).toHaveBeenCalledWith(
      expect.objectContaining({
        expectedOutstandingAmount: "80.00",
        calculateAmountDue: expect.any(Function),
        idempotencyKey: "tool-run-1",
      }),
    );

    const call = paymentData.createOutstandingPaymentForPeriod.mock.calls[0][0];
    expect(
      call.calculateAmountDue(enrollmentWithPaidAmount(0)).toString(),
    ).toBe("100");
  });

  it("refuses a reminder when its recipient changes after approval", async () => {
    const reminderEnrollment = (email: string) => ({
      ...enrollmentWithPaidAmount(20),
      student: {
        firstName: "Maya",
        lastName: "Chen",
        email: null,
        guardians: [{ guardian: { firstName: "Ana", email } }],
      },
      tutor: { firstName: "Taylor", lastName: "Lee" },
      subject: { name: "Math" },
    });
    paymentData.getEnrollmentForPaymentReminder
      .mockResolvedValueOnce(reminderEnrollment("approved@example.com"))
      .mockResolvedValueOnce(reminderEnrollment("changed@example.com"));
    emailData.getLatestEmailTemplate.mockResolvedValue({
      subject: "Payment reminder — @subject (@month)",
      body: "Hello @guardian. Amount: @amount",
    });

    const confirmation = await getPaymentReminderConfirmation(
      "enrollment-1",
      "2026-08",
    );
    await expect(
      sendPaymentReminderEmail(
        "enrollment-1",
        "2026-08",
        "tool-run-1",
        confirmation.digest,
      ),
    ).rejects.toThrow("changed after approval was requested");
    expect(emailUtility.sendEmail).not.toHaveBeenCalled();
  });
});
