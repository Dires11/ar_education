import { beforeEach, describe, expect, it, vi } from "vitest";

const sessionData = vi.hoisted(() => ({
  getGroupRecurrenceRulesForMonth: vi.fn(),
  getRecurrenceRulesForMonth: vi.fn(),
}));

vi.mock("@/lib/data/sessions", () => sessionData);
vi.mock("@/lib/data/groups", () => ({ getGroupWithMembers: vi.fn() }));
vi.mock("@/lib/services/payments", () => ({
  getEnrollmentPaidMonths: vi.fn(),
}));

import { getVirtualSessionsForMonth } from "@/lib/services/sessions";

const safetyLimits = {
  rules: 1_000,
  groupEnrollments: 100,
  virtualSessions: 5_000,
} as const;

describe("assistant recurring schedule bounds", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    sessionData.getGroupRecurrenceRulesForMonth.mockResolvedValue([]);
  });

  it("rejects an over-limit private recurrence result before expanding it", async () => {
    const rules = Array.from({ length: 1_001 }, () => ({}));

    await expect(
      getVirtualSessionsForMonth(
        new Date("2026-08-01T00:00:00.000Z"),
        [],
        rules as never,
        true,
        safetyLimits,
      ),
    ).rejects.toThrow("1,000-recurrence-rule");
  });

  it("rejects a group whose bounded membership probe reports overflow", async () => {
    sessionData.getGroupRecurrenceRulesForMonth.mockResolvedValue([
      {
        group: {
          enrollments: Array.from({ length: 101 }, () => ({})),
        },
      },
    ]);

    await expect(
      getVirtualSessionsForMonth(
        new Date("2026-08-01T00:00:00.000Z"),
        [],
        [] as never,
        true,
        safetyLimits,
      ),
    ).rejects.toThrow("100-member");
    expect(
      sessionData.getGroupRecurrenceRulesForMonth,
    ).toHaveBeenCalledWith(expect.any(Date), expect.any(Date), safetyLimits);
  });
});
