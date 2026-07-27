import { beforeEach, describe, expect, it, vi } from "vitest";

const prismaMock = vi.hoisted(() => ({
  student: {
    findMany: vi.fn(),
    count: vi.fn(),
  },
  $transaction: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }));

import {
  queryStudentDirectoryData,
  updateLinkedGuardian,
} from "@/lib/data/students";

describe("student directory data queries", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("answers youngest-student rankings in one bounded query", async () => {
    const youngest = {
      id: "student-1",
      firstName: "Maya",
      lastName: "Chen",
      dob: new Date("2016-09-14T00:00:00.000Z"),
      school: "Lincoln",
      gradeLevel: "4",
      status: "ACTIVE",
      createdAt: new Date("2026-01-01T00:00:00.000Z"),
      updatedAt: new Date("2026-07-01T00:00:00.000Z"),
    };
    prismaMock.student.findMany.mockResolvedValue([youngest]);
    prismaMock.student.count
      .mockResolvedValueOnce(23)
      .mockResolvedValueOnce(20);

    const result = await queryStudentDirectoryData({
      sortBy: "DATE_OF_BIRTH",
      sortOrder: "DESC",
      page: 1,
      limit: 1,
    });

    expect(prismaMock.student.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { AND: [{}, { dob: { not: null } }] },
        orderBy: [
          { dob: "desc" },
          { lastName: "asc" },
          { firstName: "asc" },
        ],
        skip: 0,
        take: 1,
      }),
    );
    expect(result).toEqual({
      students: [youngest],
      matchingCount: 23,
      rankedCount: 20,
      missingDateOfBirthCount: 3,
      page: 1,
      limit: 1,
      hasMore: true,
    });
  });

  it("matches a full student name token by token", async () => {
    prismaMock.student.findMany.mockResolvedValue([]);
    prismaMock.student.count
      .mockResolvedValueOnce(0)
      .mockResolvedValueOnce(0);

    await queryStudentDirectoryData({
      query: "Test Student",
      sortBy: "LAST_NAME",
      sortOrder: "ASC",
      page: 1,
      limit: 10,
    });

    const where = prismaMock.student.findMany.mock.calls[0]?.[0]?.where;
    expect(where.AND).toHaveLength(2);
    expect(where.AND[0]).toEqual(
      expect.objectContaining({
        OR: expect.arrayContaining([
          { firstName: { contains: "Test", mode: "insensitive" } },
          { lastName: { contains: "Test", mode: "insensitive" } },
        ]),
      }),
    );
    expect(where.AND[1]).toEqual(
      expect.objectContaining({
        OR: expect.arrayContaining([
          { firstName: { contains: "Student", mode: "insensitive" } },
          { lastName: { contains: "Student", mode: "insensitive" } },
        ]),
      }),
    );
  });
});

describe("linked guardian updates", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("rejects mismatched student and guardian IDs before changing either record", async () => {
    const tx = {
      studentGuardian: {
        findUnique: vi.fn().mockResolvedValue(null),
        updateMany: vi.fn(),
        update: vi.fn(),
      },
      guardian: { update: vi.fn() },
    };
    prismaMock.$transaction.mockImplementation(
      (callback: (client: typeof tx) => unknown) => callback(tx),
    );

    await expect(
      updateLinkedGuardian({
        studentId: "student-2",
        guardianId: "guardian-1",
        data: { phone: "555-0100" },
      }),
    ).rejects.toThrow("Guardian is not linked to this student");

    expect(tx.guardian.update).not.toHaveBeenCalled();
    expect(tx.studentGuardian.update).not.toHaveBeenCalled();
  });

  it("updates guardian details and primary state in one transaction", async () => {
    const existing = {
      id: "guardian-1",
      phone: "555-0000",
      relationship: "GUARDIAN",
    };
    const updated = { ...existing, phone: "555-0100" };
    const tx = {
      studentGuardian: {
        findUnique: vi
          .fn()
          .mockResolvedValue({ guardian: existing, isPrimary: false }),
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
        update: vi.fn().mockResolvedValue({}),
      },
      guardian: { update: vi.fn().mockResolvedValue(updated) },
    };
    prismaMock.$transaction.mockImplementation(
      (callback: (client: typeof tx) => unknown) => callback(tx),
    );

    await expect(
      updateLinkedGuardian({
        studentId: "student-1",
        guardianId: "guardian-1",
        data: { phone: "555-0100" },
        isPrimary: true,
      }),
    ).resolves.toEqual({ existing, updated });

    expect(tx.guardian.update).toHaveBeenCalledWith({
      where: { id: "guardian-1" },
      data: { phone: "555-0100" },
    });
    expect(tx.studentGuardian.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { isPrimary: true } }),
    );
  });
});
