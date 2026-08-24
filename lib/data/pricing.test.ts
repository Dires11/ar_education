import { beforeEach, describe, expect, it, vi } from "vitest";

const prismaMock = vi.hoisted(() => ({
  student: { findUnique: vi.fn() },
}));

vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }));

import { getStudentBillingDataForAssistant } from "@/lib/data/pricing";

describe("bounded exact assistant balance data", () => {
  beforeEach(() => vi.clearAllMocks());

  it("uses sentinel limits for every billing-history collection", async () => {
    prismaMock.student.findUnique.mockResolvedValue(null);

    await getStudentBillingDataForAssistant("student-1");

    const query = prismaMock.student.findUnique.mock.calls[0][0];
    expect(query.where).toEqual({ id: "student-1" });
    expect(query.select.payments.take).toBe(101);
    expect(query.select.enrollments.take).toBe(11);
    expect(query.select.enrollments.select.sessionAttendance.take).toBe(101);
    expect(query.select.enrollments.select.discounts.take).toBe(21);
    expect(query.select.payments.orderBy).toEqual({ id: "asc" });
    expect(query.select.enrollments.orderBy).toEqual({ id: "asc" });
  });
});
