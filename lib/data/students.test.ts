import { beforeEach, describe, expect, it, vi } from "vitest";

const prismaMock = vi.hoisted(() => ({
  student: {
    findMany: vi.fn(),
    findUnique: vi.fn(),
    count: vi.fn(),
  },
  enrollment: { count: vi.fn() },
  studentGuardian: { findUnique: vi.fn() },
  $transaction: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }));

import {
  getLinkedGuardianForAssistant,
  getStudentForAssistant,
  queryStudentDirectoryData,
  resolveStudentCommunicationRecipientsData,
  updateLinkedGuardian,
} from "@/lib/data/students";

describe("student directory data queries", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("bounds nested guardians and enrollments in exact assistant detail", async () => {
    prismaMock.student.findUnique.mockResolvedValue(null);

    await getStudentForAssistant("student-1", 12);

    expect(prismaMock.student.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "student-1" },
        select: expect.objectContaining({
          guardians: expect.objectContaining({ take: 12 }),
          enrollments: expect.objectContaining({ take: 12 }),
        }),
      }),
    );
    const select = prismaMock.student.findUnique.mock.calls[0][0].select;
    expect(select.enrollments.select.student).toBeUndefined();
  });

  it("returns a dedicated active-enrollment count for assistant cards", async () => {
    prismaMock.student.findUnique.mockResolvedValue({
      id: "student-1",
      enrollments: Array.from({ length: 20 }, () => ({ status: "COMPLETED" })),
    });
    prismaMock.enrollment.count.mockResolvedValue(1);

    await expect(getStudentForAssistant("student-1")).resolves.toMatchObject({
      activeEnrollmentCount: 1,
    });
    expect(prismaMock.enrollment.count).toHaveBeenCalledWith({
      where: { studentId: "student-1", status: "ACTIVE" },
    });
  });

  it("looks up a guardian only through the exact student relationship", async () => {
    prismaMock.studentGuardian.findUnique.mockResolvedValue(null);

    await getLinkedGuardianForAssistant("student-1", "guardian-1");

    expect(prismaMock.studentGuardian.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          studentId_guardianId: {
            studentId: "student-1",
            guardianId: "guardian-1",
          },
        },
      }),
    );
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
      .mockResolvedValueOnce(20)
      .mockResolvedValueOnce(1);

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
      topRankTieCount: 1,
      topRankTiesTruncated: false,
    });
  });

  it("returns all bounded students tied at the youngest rank", async () => {
    const tied = ["Ana", "Maya"].map((firstName, index) => ({
      id: `student-${index + 1}`,
      firstName,
      lastName: "Chen",
      dob: new Date("2016-09-14T00:00:00.000Z"),
      school: null,
      gradeLevel: null,
      status: "ACTIVE",
      createdAt: new Date("2026-01-01T00:00:00.000Z"),
      updatedAt: new Date("2026-01-01T00:00:00.000Z"),
    }));
    prismaMock.student.findMany
      .mockResolvedValueOnce([tied[0]])
      .mockResolvedValueOnce(tied);
    prismaMock.student.count
      .mockResolvedValueOnce(2)
      .mockResolvedValueOnce(2)
      .mockResolvedValueOnce(2);

    const result = await queryStudentDirectoryData({
      sortBy: "DATE_OF_BIRTH",
      sortOrder: "DESC",
      page: 1,
      limit: 1,
    });

    expect(result.students).toEqual(tied);
    expect(result.topRankTieCount).toBe(2);
    expect(result.topRankTiesTruncated).toBe(false);
    expect(prismaMock.student.findMany.mock.calls[1][0]).toEqual(
      expect.objectContaining({ take: 100 }),
    );
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

  it("resolves a large communication cohort with bounded contact data", async () => {
    prismaMock.student.count.mockResolvedValue(120);
    prismaMock.student.findMany.mockResolvedValue([
      {
        id: "student-101",
        firstName: "Maya",
        lastName: "Chen",
        status: "ACTIVE",
        email: null,
        guardians: [{
          guardian: {
            firstName: "Ana",
            lastName: "Chen",
            email: "ana@example.com",
          },
        }],
      },
    ]);
    prismaMock.$transaction.mockImplementation((queries: Promise<unknown>[]) =>
      Promise.all(queries),
    );

    await expect(
      resolveStudentCommunicationRecipientsData({
        status: "ACTIVE",
        school: "Lincoln",
        page: 2,
        limit: 100,
      }),
    ).resolves.toMatchObject({
      total: 120,
      page: 2,
      hasMore: false,
      recipients: [{
        studentId: "student-101",
        recipientEmail: "ana@example.com",
        deliverable: true,
      }],
    });
    expect(prismaMock.student.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          status: "ACTIVE",
          school: { contains: "Lincoln", mode: "insensitive" },
        },
        skip: 100,
        take: 100,
        select: expect.objectContaining({
          guardians: expect.objectContaining({
            where: { isPrimary: true },
            take: 1,
          }),
        }),
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
