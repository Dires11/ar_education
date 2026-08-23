import { beforeEach, describe, expect, it, vi } from "vitest";

const prismaMock = vi.hoisted(() => ({
  payment: {
    create: vi.fn(),
    upsert: vi.fn(),
  },
  $transaction: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }));

import { Prisma } from "@/generated/prisma";
import {
  createOutstandingPaymentForPeriod,
  createPayment,
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
