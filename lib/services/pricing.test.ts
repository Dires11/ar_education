import { beforeEach, describe, expect, it, vi } from "vitest";

const pricingDataMocks = vi.hoisted(() => ({
  getStudentBillingData: vi.fn(),
  getStudentBillingDataForAssistant: vi.fn(),
}));

vi.mock("@/lib/data/pricing", () => ({
  ASSISTANT_EXACT_BALANCE_QUERY_LIMITS: {
    payments: 100,
    enrollments: 10,
    attendancePerEnrollment: 100,
    discountsPerEnrollment: 20,
  },
  ...pricingDataMocks,
}));

import { getStudentBalanceForAssistant } from "@/lib/services/pricing";

describe("assistant exact balance calculation", () => {
  beforeEach(() => vi.clearAllMocks());

  it("refuses to report a balance when a sentinel proves history was truncated", async () => {
    pricingDataMocks.getStudentBillingDataForAssistant.mockResolvedValue({
      id: "student-1",
      payments: Array.from({ length: 101 }, () => ({ amount: "1" })),
      enrollments: [],
    });

    await expect(
      getStudentBalanceForAssistant("student-1"),
    ).resolves.toMatchObject({
      calculationComplete: false,
      warnings: [expect.stringContaining("more billing history")],
    });
  });
});
