import { describe, expect, it } from "vitest";
import { minimizeAssistantDto } from "@/lib/services/assistant/dto";

describe("assistant DTO minimization", () => {
  it("removes provider and storage identifiers recursively", () => {
    expect(
      minimizeAssistantDto({
        id: "student-1",
        avatarPublicId: "cloudinary-secret",
        guardian: {
          id: "guardian-1",
          clerkUserId: "provider-user",
        },
        payments: [
          {
            id: "payment-1",
            recordedById: "admin-1",
            amount: "120",
          },
        ],
      }),
    ).toEqual({
      id: "student-1",
      guardian: { id: "guardian-1" },
      payments: [{ id: "payment-1", amount: "120" }],
    });
  });
});
