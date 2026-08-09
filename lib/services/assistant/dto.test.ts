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

  it("drops future and nested fields unless they are explicitly allowlisted", () => {
    expect(
      minimizeAssistantDto({
        id: "payment-1",
        amount: "120",
        futureSensitiveField: "do-not-send",
        recordedBy: {
          id: "admin-1",
          email: "owner@example.com",
        },
        student: {
          id: "student-1",
          firstName: "Maya",
          privateFutureField: "do-not-send",
        },
      }),
    ).toEqual({
      id: "payment-1",
      amount: "120",
      student: {
        id: "student-1",
        firstName: "Maya",
      },
    });
  });

  it("preserves the bounded schedule and reporting fields the model needs", () => {
    expect(
      minimizeAssistantDto({
        realSessions: [
          {
            id: "session-1",
            scheduledFor: "2026-07-27T17:00:00.000Z",
            durationMinutes: 60,
            internalFutureField: "hidden",
          },
        ],
        summaries: [
          {
            enrollmentId: "enrollment-1",
            usedThisWeek: 1,
            remaining: 1,
          },
        ],
        preview: {
          hasLimit: true,
          isOverLimit: false,
          totalPlanned: 2,
          proposedSessions: 8,
          materializableSessions: 6,
          existingPlannedInWeek: 2,
          firstExceededDate: "2026-08-31T00:00:00.000Z",
          suggestedEndsOn: "2026-08-30",
        },
        monthlyRevenue: [{ month: "Jul", revenue: 1200 }],
      }),
    ).toEqual({
      realSessions: [
        {
          id: "session-1",
          scheduledFor: "2026-07-27T17:00:00.000Z",
          durationMinutes: 60,
        },
      ],
      summaries: [
        {
          enrollmentId: "enrollment-1",
          usedThisWeek: 1,
          remaining: 1,
        },
      ],
      preview: {
        hasLimit: true,
        isOverLimit: false,
        totalPlanned: 2,
        proposedSessions: 8,
        materializableSessions: 6,
        existingPlannedInWeek: 2,
        firstExceededDate: "2026-08-31T00:00:00.000Z",
        suggestedEndsOn: "2026-08-30",
      },
      monthlyRevenue: [{ month: "Jul", revenue: 1200 }],
    });
  });
});
