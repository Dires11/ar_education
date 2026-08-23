import { beforeEach, describe, expect, it, vi } from "vitest";

const prismaMock = vi.hoisted(() => ({
  tutor: {
    count: vi.fn(),
    findMany: vi.fn(),
  },
}));

vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }));

import { listTutors } from "@/lib/data/tutors";

describe("tutor search", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    prismaMock.tutor.findMany.mockResolvedValue([]);
    prismaMock.tutor.count.mockResolvedValue(0);
  });

  it("matches every full-name token across tutor identity fields", async () => {
    await listTutors({ search: "John Smith" });

    expect(prismaMock.tutor.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          AND: [
            {
              OR: expect.arrayContaining([
                {
                  firstName: { contains: "John", mode: "insensitive" },
                },
                { lastName: { contains: "John", mode: "insensitive" } },
              ]),
            },
            {
              OR: expect.arrayContaining([
                {
                  firstName: { contains: "Smith", mode: "insensitive" },
                },
                { lastName: { contains: "Smith", mode: "insensitive" } },
              ]),
            },
          ],
        },
      }),
    );
  });
});
