import { beforeEach, describe, expect, it, vi } from "vitest";

const prismaMock = vi.hoisted(() => ({
  discount: {
    findUnique: vi.fn(),
  },
  enrollment: {
    findUnique: vi.fn(),
  },
}));

vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }));

import {
  getDiscountForAssistant,
  getEnrollmentForAssistant,
} from "@/lib/data/enrollments";

describe("assistant enrollment persistence", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    prismaMock.enrollment.findUnique.mockResolvedValue(null);
  });

  it("pages discounts with deterministic ordering", async () => {
    await getEnrollmentForAssistant("enrollment-1", 3, 25);

    expect(prismaMock.enrollment.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "enrollment-1" },
        select: expect.objectContaining({
          discounts: expect.objectContaining({
            orderBy: [{ createdAt: "desc" }, { id: "asc" }],
            skip: 50,
            take: 25,
            select: expect.objectContaining({ notes: true }),
          }),
        }),
      }),
    );
  });

  it("includes notes when inspecting one exact discount", async () => {
    prismaMock.discount.findUnique.mockResolvedValue(null);

    await getDiscountForAssistant("discount-1");

    expect(prismaMock.discount.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "discount-1" },
        select: expect.objectContaining({ notes: true }),
      }),
    );
  });
});
