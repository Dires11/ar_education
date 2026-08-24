import { beforeEach, describe, expect, it, vi } from "vitest";

const resendSend = vi.hoisted(() => vi.fn());

vi.mock("resend", () => ({
  Resend: class {
    emails = { send: resendSend };
  },
}));

import { DeliveryOutcomeUnknownError } from "@/lib/utils/email-errors";
import { sendEmail } from "@/lib/utils/email";

describe("email transport outcomes", () => {
  beforeEach(() => vi.clearAllMocks());

  it("marks a thrown provider transport failure as ambiguous", async () => {
    resendSend.mockRejectedValue(new Error("socket timed out"));

    await expect(
      sendEmail({
        to: "guardian@example.com",
        subject: "Schedule",
        html: "<p>Hello</p>",
        idempotencyKey: "tool-1:student-1",
      }),
    ).rejects.toBeInstanceOf(DeliveryOutcomeUnknownError);
  });

  it("keeps an explicit provider rejection as a known failure", async () => {
    resendSend.mockResolvedValue({
      data: null,
      error: { message: "invalid recipient" },
    });

    await expect(
      sendEmail({
        to: "invalid",
        subject: "Schedule",
        html: "<p>Hello</p>",
      }),
    ).rejects.toThrow("Failed to send email: invalid recipient");
  });
});
