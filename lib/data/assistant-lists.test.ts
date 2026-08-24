import { beforeEach, describe, expect, it, vi } from "vitest";

const prismaMock = vi.hoisted(() => ({
  $transaction: vi.fn(),
  emailTemplate: { count: vi.fn(), findMany: vi.fn() },
  enrollment: { count: vi.fn(), findMany: vi.fn() },
  admin: { count: vi.fn(), findMany: vi.fn() },
  group: { count: vi.fn(), findMany: vi.fn() },
  package: { count: vi.fn(), findMany: vi.fn() },
  subject: { count: vi.fn(), findMany: vi.fn() },
}));

vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }));

import { listEmailTemplatesForAssistant } from "@/lib/data/emails";
import { searchEnrollmentsForAssistant } from "@/lib/data/enrollments";
import { listGroupsForAssistant } from "@/lib/data/groups";
import { listPackagesForAssistant } from "@/lib/data/packages";
import { listSubjectsForAssistant } from "@/lib/data/subjects";
import { listAdminsForAssistant } from "@/lib/data/team";

describe("bounded assistant list queries", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("queries only a bounded, body-free email-template summary", async () => {
    prismaMock.$transaction.mockResolvedValue([
      2,
      [
        {
          id: "template-1",
          name: "Reminder",
          type: "PAYMENT_REMINDER",
          subject: "Payment due",
          updatedAt: new Date("2026-08-23T00:00:00.000Z"),
        },
      ],
    ]);

    await expect(
      listEmailTemplatesForAssistant({ page: 2, limit: 1 }),
    ).resolves.toMatchObject({
      total: 2,
      page: 2,
      hasMore: false,
      templates: [expect.not.objectContaining({ body: expect.anything() })],
    });
    expect(prismaMock.emailTemplate.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        take: 1,
        skip: 1,
        select: expect.not.objectContaining({ body: expect.anything() }),
      }),
    );
  });

  it("queries bounded group identities without contact or enrollment notes", async () => {
    prismaMock.$transaction.mockResolvedValue([
      3,
      [
        {
          id: "group-1",
          name: "Algebra A",
          tutor: { id: "tutor-1", firstName: "Theo", lastName: "Grant" },
          subject: { id: "subject-1", name: "Algebra" },
          _count: { enrollments: 21 },
          enrollments: [
            {
              student: {
                id: "student-1",
                firstName: "Maya",
                lastName: "Chen",
              },
            },
          ],
        },
      ],
    ]);

    await expect(
      listGroupsForAssistant({ tutorId: "tutor-1", page: 2, limit: 1 }),
    ).resolves.toEqual({
      total: 3,
      page: 2,
      limit: 1,
      hasMore: true,
      groups: [
        {
          id: "group-1",
          name: "Algebra A",
          tutor: { id: "tutor-1", name: "Theo Grant" },
          subject: { id: "subject-1", name: "Algebra" },
          activeStudentCount: 21,
          students: [{ id: "student-1", name: "Maya Chen" }],
        },
      ],
    });
    expect(prismaMock.group.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        take: 1,
        skip: 1,
        where: { tutorId: "tutor-1" },
        select: expect.not.objectContaining({
          email: expect.anything(),
          phone: expect.anything(),
          notes: expect.anything(),
        }),
      }),
    );
  });

  it("uses exact filters and hard query limits for catalog summaries", async () => {
    prismaMock.$transaction
      .mockResolvedValueOnce([
        1,
        [{ id: "subject-1", name: "Algebra" }],
      ])
      .mockResolvedValueOnce([0, []]);

    await listSubjectsForAssistant({ id: "subject-1", page: 2, limit: 5 });
    await listPackagesForAssistant({ activeOnly: true, page: 3, limit: 10 });

    expect(prismaMock.subject.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "subject-1" },
        skip: 5,
        take: 5,
      }),
    );
    expect(prismaMock.package.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { isActive: true },
        skip: 20,
        take: 10,
      }),
    );
  });

  it("retrieves later enrollment pages with deterministic ordering", async () => {
    prismaMock.enrollment.count.mockResolvedValue(45);
    prismaMock.enrollment.findMany.mockResolvedValue([]);

    await expect(
      searchEnrollmentsForAssistant({
        status: "ACTIVE",
        groupId: "group-1",
        page: 3,
        limit: 20,
      }),
    ).resolves.toMatchObject({
      total: 45,
      page: 3,
      limit: 20,
      hasMore: false,
    });
    expect(prismaMock.enrollment.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { status: "ACTIVE", groupId: "group-1" },
        orderBy: [{ createdAt: "desc" }, { id: "asc" }],
        skip: 40,
        take: 20,
      }),
    );
  });

  it("stably pages assistant team members with an ID tie-breaker", async () => {
    prismaMock.$transaction.mockResolvedValue([2, []]);

    await listAdminsForAssistant({ page: 2, limit: 1 });

    expect(prismaMock.admin.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        orderBy: [{ createdAt: "asc" }, { id: "asc" }],
        skip: 1,
        take: 1,
      }),
    );
  });
});
