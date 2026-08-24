import { beforeEach, describe, expect, it, vi } from "vitest";

const prismaMock = vi.hoisted(() => ({
  tutor: {
    count: vi.fn(),
    findMany: vi.fn(),
    findUnique: vi.fn(),
  },
  session: {
    aggregate: vi.fn(),
    count: vi.fn(),
    findMany: vi.fn(),
  },
}));

vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }));

import {
  getTutorForAssistant,
  getTutorProfileForAssistantMutation,
  getTutorPayrollForAssistantData,
  listTutors,
  searchTutorsForAssistant,
} from "@/lib/data/tutors";

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

    await getTutorForAssistant("tutor-1", { page: 2, limit: 15 });

    const query = prismaMock.tutor.findUnique.mock.calls[0][0];
    expect(query.where).toEqual({ id: "tutor-1" });
    expect(query.select.enrollments.skip).toBe(15);
    expect(query.select.enrollments.take).toBe(15);
    expect(query.select.subjects).toMatchObject({ skip: 15, take: 15 });
    expect(query.select.enrollments.select.student).toEqual({
      select: { id: true, firstName: true, lastName: true },
    });
    expect(query.select.enrollments.select.student.select).not.toHaveProperty(
      "email",
    );
  });

  it("caps and counts subjects in assistant tutor search", async () => {
    await searchTutorsForAssistant({
      query: "Theo",
      status: "ACTIVE",
      subjectId: "subject-1",
      page: 2,
      limit: 10,
    });

    const query = prismaMock.tutor.findMany.mock.calls[0][0];
    expect(query.skip).toBe(10);
    expect(query.take).toBe(10);
    expect(query.select.subjects.take).toBe(20);
    expect(query.select.subjects.where).toEqual({ subjectId: "subject-1" });
    expect(query.select.subjects.select).toEqual({
      subject: { select: { id: true, name: true } },
    });
    expect(query.select._count).toEqual({ select: { subjects: true } });
  });

  it("preloads tutor mutations without loading enrollment relations", async () => {
    prismaMock.tutor.findUnique.mockResolvedValue(null);

    await getTutorProfileForAssistantMutation("tutor-1");

    const query = prismaMock.tutor.findUnique.mock.calls[0][0];
    expect(query.where).toEqual({ id: "tutor-1" });
    expect(query).not.toHaveProperty("include");
    expect(query.select).not.toHaveProperty("enrollments");
    expect(query.select).not.toHaveProperty("subjects");
  });

  it("aggregates payroll while returning only bounded compact sessions", async () => {
    prismaMock.tutor.findUnique.mockResolvedValue({
      id: "tutor-1",
      firstName: "Theo",
      lastName: "Grant",
      hourlyRate: "40",
    });
    prismaMock.session.aggregate.mockResolvedValue({
      _sum: { durationMinutes: 600 },
    });
    prismaMock.session.count.mockResolvedValue(25);
    prismaMock.session.findMany.mockResolvedValue([]);

    const result = await getTutorPayrollForAssistantData(
      "tutor-1",
      new Date("2026-01-01T00:00:00.000Z"),
      new Date("2026-02-01T00:00:00.000Z"),
      10,
    );

    expect(result).toMatchObject({ total: 25, totalMinutes: 600 });
    const query = prismaMock.session.findMany.mock.calls[0][0];
    expect(query.take).toBe(10);
    expect(query.select.enrollment.select.student.select).toEqual({
      id: true,
      firstName: true,
      lastName: true,
    });
    expect(query.select.enrollment.select.student.select).not.toHaveProperty(
      "email",
    );
  });
});
