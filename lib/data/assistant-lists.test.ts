import { beforeEach, describe, expect, it, vi } from "vitest";

const prismaMock = vi.hoisted(() => ({
  $transaction: vi.fn(),
  emailTemplate: { count: vi.fn(), findMany: vi.fn() },
  group: { count: vi.fn(), findMany: vi.fn() },
  package: { count: vi.fn(), findMany: vi.fn() },
  subject: { count: vi.fn(), findMany: vi.fn() },
}));

vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }));

import { listEmailTemplatesForAssistant } from "@/lib/data/emails";
import { listGroupsForAssistant } from "@/lib/data/groups";
import { listPackagesForAssistant } from "@/lib/data/packages";
import { listSubjectsForAssistant } from "@/lib/data/subjects";

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

    await expect(listEmailTemplatesForAssistant(1)).resolves.toMatchObject({
      total: 2,
      hasMore: true,
      templates: [expect.not.objectContaining({ body: expect.anything() })],
    });
    expect(prismaMock.emailTemplate.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        take: 1,
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
      listGroupsForAssistant({ tutorId: "tutor-1", limit: 1 }),
    ).resolves.toEqual({
      total: 3,
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

    await listSubjectsForAssistant({ id: "subject-1", limit: 5 });
    await listPackagesForAssistant({ activeOnly: true, limit: 10 });

    expect(prismaMock.subject.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "subject-1" }, take: 5 }),
    );
    expect(prismaMock.package.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { isActive: true }, take: 10 }),
    );
  });
});
