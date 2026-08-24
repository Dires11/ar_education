import { beforeEach, describe, expect, it, vi } from "vitest";

const prismaMock = vi.hoisted(() => ({
  enrollment: { count: vi.fn(), findMany: vi.fn() },
  student: { count: vi.fn(), findMany: vi.fn() },
  $transaction: vi.fn((queries: Promise<unknown>[]) => Promise.all(queries)),
}));

vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }));

import {
  getStudentsWithBalanceForAssistant,
  getUpcomingPackageEndingsForAssistant,
} from "@/lib/data/dashboard";

describe("bounded assistant dashboard data", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    prismaMock.$transaction.mockImplementation((queries: Promise<unknown>[]) =>
      Promise.all(queries),
    );
  });

  it("pages compact upcoming package endings", async () => {
    prismaMock.enrollment.count.mockResolvedValue(75);
    prismaMock.enrollment.findMany.mockResolvedValue([]);

    await expect(
      getUpcomingPackageEndingsForAssistant({
        today: new Date("2026-08-23T00:00:00.000Z"),
        withinDays: 14,
        page: 2,
        limit: 50,
      }),
    ).resolves.toMatchObject({ total: 75, page: 2, hasMore: false });
    expect(prismaMock.enrollment.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ skip: 50, take: 50 }),
    );
  });

  it("caps every nested relation used for assistant balance summaries", async () => {
    prismaMock.student.count.mockResolvedValue(2_000);
    prismaMock.student.findMany.mockResolvedValue([]);

    await expect(
      getStudentsWithBalanceForAssistant({ page: 3, limit: 25 }),
    ).resolves.toMatchObject({
      total: 2_000,
      page: 3,
      limit: 10,
      hasMore: true,
    });
    const query = prismaMock.student.findMany.mock.calls[0][0];
    expect(query.skip).toBe(20);
    expect(query.take).toBe(10);
    expect(query.select.payments.take).toBe(101);
    expect(query.select.enrollments.take).toBe(11);
    expect(query.select.enrollments.select.sessionAttendance.take).toBe(101);
    expect(query.select.enrollments.select.discounts.take).toBe(21);

    const maximumRowsMaterialized =
      query.take *
      (query.select.payments.take +
        query.select.enrollments.take *
          (1 +
            query.select.enrollments.select.sessionAttendance.take +
            query.select.enrollments.select.discounts.take));
    expect(maximumRowsMaterialized).toBeLessThan(15_000);
  });
});
