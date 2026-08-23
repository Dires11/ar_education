import { beforeEach, describe, expect, it, vi } from "vitest";

const prismaMock = vi.hoisted(() => ({
  tutor: {
    count: vi.fn(),
    findMany: vi.fn(),
    findUnique: vi.fn(),
  },
}));

vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }));

import { getTutorForAssistant, listTutors } from "@/lib/data/tutors";

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

  it("caps exact-detail enrollments and selects only student identity", async () => {
    prismaMock.tutor.findUnique.mockResolvedValue(null);

    await getTutorForAssistant("tutor-1", 15);

    const query = prismaMock.tutor.findUnique.mock.calls[0][0];
    expect(query.where).toEqual({ id: "tutor-1" });
    expect(query.select.enrollments.take).toBe(15);
    expect(query.select.enrollments.select.student).toEqual({
      select: { id: true, firstName: true, lastName: true },
    });
    expect(query.select.enrollments.select.student.select).not.toHaveProperty(
      "email",
    );
  });
});
