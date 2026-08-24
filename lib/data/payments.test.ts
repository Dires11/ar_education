import { beforeEach, describe, expect, it, vi } from "vitest";

const prismaMock = vi.hoisted(() => ({
  enrollment: {
    aggregate: vi.fn(),
    count: vi.fn(),
    findMany: vi.fn(),
  },
  payment: {
    count: vi.fn(),
    create: vi.fn(),
    findMany: vi.fn(),
    findUnique: vi.fn(),
    upsert: vi.fn(),
  },
  $transaction: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }));

import { Prisma } from "@/generated/prisma";
import {
  createOutstandingPaymentForPeriod,
  createPayment,
  getActiveSubscriptionEnrollments,
  getPaymentForAssistantConfirmation,
  listPaymentsForAssistant,
} from "@/lib/data/payments";

const paymentInput = {
  studentId: "student-1",
  amount: "120",
  method: "CARD" as const,
  paidAt: new Date("2026-08-08T00:00:00.000Z"),
  recordedById: "admin-1",
};

describe("payment persistence", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("upserts assistant payments by their stable tool-run key", async () => {
    prismaMock.payment.upsert.mockResolvedValue({ id: "payment-1" });

    await createPayment({
      ...paymentInput,
      idempotencyKey: "tool-run-1",
    });

    expect(prismaMock.payment.upsert).toHaveBeenCalledWith({
      where: { idempotencyKey: "tool-run-1" },
      update: {},
      create: { ...paymentInput, idempotencyKey: "tool-run-1" },
    });
    expect(prismaMock.payment.create).not.toHaveBeenCalled();
  });

  it("keeps manual payments on the ordinary create path", async () => {
    prismaMock.payment.create.mockResolvedValue({ id: "payment-2" });

    await createPayment(paymentInput);

    expect(prismaMock.payment.create).toHaveBeenCalledWith({
      data: paymentInput,
    });
    expect(prismaMock.payment.upsert).not.toHaveBeenCalled();
  });

  it("pages subscription enrollments and only loads payment coverage in the requested window", async () => {
    prismaMock.enrollment.count.mockResolvedValue(250);
    prismaMock.enrollment.findMany.mockResolvedValue([
      { id: "enrollment-101" },
    ]);
    prismaMock.enrollment.aggregate.mockResolvedValue({
      _min: { startDate: new Date("2024-04-15T00:00:00.000Z") },
    });
    prismaMock.$transaction.mockImplementation((queries: Promise<unknown>[]) =>
      Promise.all(queries),
    );

    await expect(
      getActiveSubscriptionEnrollments({
        page: 2,
        limit: 100,
        paymentFromMonth: "2025-09",
        paymentToMonth: "2026-08",
      }),
    ).resolves.toMatchObject({
      total: 250,
      page: 2,
      limit: 100,
      hasMore: true,
      oldestApplicableStartDate: new Date("2024-04-15T00:00:00.000Z"),
    });
    expect(prismaMock.enrollment.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        orderBy: { id: "asc" },
        skip: 100,
        take: 100,
        include: expect.objectContaining({
          payments: {
            where: {
              coversMonth: { gte: "2025-09", lte: "2026-08" },
            },
            select: { coversMonth: true, amount: true },
          },
        }),
      }),
    );
    expect(prismaMock.enrollment.aggregate).toHaveBeenCalledWith({
      where: {
        status: "ACTIVE",
        package: { type: "MONTHLY" },
      },
      _min: { startDate: true },
    });
  });

  it("returns an explicit continuation signal for payment history", async () => {
    prismaMock.payment.count.mockResolvedValue(65);
    prismaMock.payment.findMany.mockResolvedValue([]);

    await expect(
      listPaymentsForAssistant({ page: 2, pageSize: 30 }),
    ).resolves.toMatchObject({
      total: 65,
      page: 2,
      limit: 30,
      hasMore: true,
    });
    expect(prismaMock.payment.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        orderBy: [{ paidAt: "desc" }, { id: "asc" }],
        skip: 30,
        take: 30,
      }),
    );
  });

  it("uses an exclusive end instant for assistant payment-history ranges", async () => {
    prismaMock.payment.count.mockResolvedValue(0);
    prismaMock.payment.findMany.mockResolvedValue([]);
    const from = new Date("2026-08-01T07:00:00.000Z");
    const to = new Date("2026-09-01T07:00:00.000Z");

    await listPaymentsForAssistant({ from, to });

    expect(prismaMock.payment.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          paidAt: { gte: from, lt: to },
        }),
      }),
    );
  });

  it("loads notes and recorder identity only for an exact payment inspection", async () => {
    prismaMock.payment.count.mockResolvedValue(0);
    prismaMock.payment.findMany.mockResolvedValue([]);

    await listPaymentsForAssistant({ paymentId: "payment-1" });
    expect(prismaMock.payment.findMany).toHaveBeenLastCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ id: "payment-1" }),
        select: expect.objectContaining({
          notes: true,
          recordedBy: { select: { id: true, name: true } },
        }),
      }),
    );

    await listPaymentsForAssistant();
    expect(prismaMock.payment.findMany).toHaveBeenLastCalledWith(
      expect.objectContaining({
        select: expect.not.objectContaining({
          notes: true,
          recordedBy: expect.anything(),
        }),
      }),
    );
  });

  it("loads a payment confirmation with compact student identity only", async () => {
    prismaMock.payment.findUnique.mockResolvedValue(null);

    await getPaymentForAssistantConfirmation("payment-1");

    const query = prismaMock.payment.findUnique.mock.calls[0][0];
    expect(query).not.toHaveProperty("include");
    expect(query.select.student.select).toEqual({
      id: true,
      firstName: true,
      lastName: true,
      avatarUrl: true,
    });
    expect(query.select.student.select).not.toHaveProperty("enrollments");
  });

  it("deduplicates a due payment without excluding other payments from coverage", async () => {
    const enrollment = {
      id: "enrollment-1",
      studentId: "student-1",
      package: { id: "package-1" },
      discounts: [],
    };
    const tx = {
      $queryRaw: vi.fn().mockResolvedValue([]),
      enrollment: { findUnique: vi.fn().mockResolvedValue(enrollment) },
      payment: {
        findUnique: vi.fn().mockResolvedValue(null),
        aggregate: vi.fn().mockResolvedValue({
          _sum: { amount: new Prisma.Decimal(20) },
        }),
        create: vi.fn().mockResolvedValue({ id: "payment-3" }),
      },
    };
    prismaMock.$transaction.mockImplementation(
      (callback: (client: typeof tx) => unknown) => callback(tx),
    );

    await createOutstandingPaymentForPeriod({
      ...paymentInput,
      enrollmentId: "enrollment-1",
      coversMonth: "2026-08",
      expectedOutstandingAmount: "80",
      calculateAmountDue: vi.fn().mockReturnValue(new Prisma.Decimal(100)),
      idempotencyKey: "tool-run-2",
    });

    expect(tx.payment.aggregate).toHaveBeenCalledWith({
      where: {
        enrollmentId: "enrollment-1",
        coversMonth: "2026-08",
      },
      _sum: { amount: true },
    });
    expect(tx.payment.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        idempotencyKey: "tool-run-2",
      }),
    });
    expect(tx.payment.create.mock.calls[0][0].data.amount.toString()).toBe(
      "80",
    );
  });

  it("returns an existing due payment before recalculating or writing", async () => {
    const existing = { id: "payment-existing" };
    const tx = {
      $queryRaw: vi.fn().mockResolvedValue([]),
      payment: {
        findUnique: vi.fn().mockResolvedValue(existing),
        aggregate: vi.fn(),
        create: vi.fn(),
      },
    };
    prismaMock.$transaction.mockImplementation(
      (callback: (client: typeof tx) => unknown) => callback(tx),
    );

    await expect(
      createOutstandingPaymentForPeriod({
        ...paymentInput,
        enrollmentId: "enrollment-1",
        coversMonth: "2026-08",
        expectedOutstandingAmount: "80",
        calculateAmountDue: vi.fn(),
        idempotencyKey: "tool-run-existing",
      }),
    ).resolves.toBe(existing);

    expect(tx.payment.aggregate).not.toHaveBeenCalled();
    expect(tx.payment.create).not.toHaveBeenCalled();
  });

  it("rejects approval when the outstanding amount changed", async () => {
    const enrollment = {
      id: "enrollment-1",
      studentId: "student-1",
      package: { id: "package-1" },
      discounts: [],
    };
    const tx = {
      $queryRaw: vi.fn().mockResolvedValue([]),
      enrollment: { findUnique: vi.fn().mockResolvedValue(enrollment) },
      payment: {
        findUnique: vi.fn().mockResolvedValue(null),
        aggregate: vi.fn().mockResolvedValue({
          _sum: { amount: new Prisma.Decimal(30) },
        }),
        create: vi.fn(),
      },
    };
    prismaMock.$transaction.mockImplementation(
      (callback: (client: typeof tx) => unknown) => callback(tx),
    );

    await expect(
      createOutstandingPaymentForPeriod({
        ...paymentInput,
        enrollmentId: "enrollment-1",
        coversMonth: "2026-08",
        expectedOutstandingAmount: "80",
        calculateAmountDue: vi.fn().mockReturnValue(new Prisma.Decimal(100)),
        idempotencyKey: "tool-run-stale",
      }),
    ).rejects.toThrow("changed from $80.00 to $70.00");

    expect(tx.payment.create).not.toHaveBeenCalled();
  });

  it("recalculates pricing only after locking its enrollment, package, and discounts", async () => {
    const enrollment = {
      id: "enrollment-1",
      studentId: "student-1",
      package: { id: "package-1" },
      discounts: [{ id: "discount-1" }],
    };
    const calculateAmountDue = vi.fn().mockReturnValue(new Prisma.Decimal(80));
    const tx = {
      $queryRaw: vi.fn().mockResolvedValue([]),
      enrollment: { findUnique: vi.fn().mockResolvedValue(enrollment) },
      payment: {
        findUnique: vi.fn().mockResolvedValue(null),
        aggregate: vi.fn().mockResolvedValue({ _sum: { amount: null } }),
        create: vi.fn(),
      },
    };
    prismaMock.$transaction.mockImplementation(
      (callback: (client: typeof tx) => unknown) => callback(tx),
    );

    await expect(
      createOutstandingPaymentForPeriod({
        ...paymentInput,
        enrollmentId: "enrollment-1",
        coversMonth: "2026-08",
        expectedOutstandingAmount: "100",
        calculateAmountDue,
        idempotencyKey: "tool-run-pricing-change",
      }),
    ).rejects.toThrow("changed from $100.00 to $80.00");

    expect(tx.$queryRaw).toHaveBeenCalledTimes(3);
    expect(calculateAmountDue).toHaveBeenCalledWith(enrollment);
    expect(tx.payment.create).not.toHaveBeenCalled();
  });
});
