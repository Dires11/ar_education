import { beforeEach, describe, expect, it, vi } from "vitest";

const prismaMock = vi.hoisted(() => ({
  recurrenceRule: { count: vi.fn(), findMany: vi.fn() },
  session: { count: vi.fn(), findMany: vi.fn(), findUnique: vi.fn() },
  $transaction: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }));

import {
  getSessionForAssistant,
  getSessionsForAssistantMonth,
  getSessionsForAssistantRange,
  listRecurrenceRulesForAssistant,
} from "@/lib/data/sessions";

describe("assistant recurrence lookup", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    prismaMock.recurrenceRule.count.mockResolvedValue(0);
    prismaMock.recurrenceRule.findMany.mockResolvedValue([]);
    prismaMock.$transaction.mockImplementation(async (queries: unknown[]) =>
      Promise.all(queries),
    );
  });

  it("includes future rules while excluding ended rules by default", async () => {
    const calendarDate = new Date("2026-08-08T00:00:00.000Z");

    await listRecurrenceRulesForAssistant({
      enrollmentId: "enrollment-1",
      includeEnded: false,
      calendarDate,
      limit: 20,
    });

    expect(prismaMock.recurrenceRule.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          enrollmentId: "enrollment-1",
          OR: [{ endsOn: null }, { endsOn: { gte: calendarDate } }],
        },
        take: 20,
      }),
    );
    expect(
      prismaMock.recurrenceRule.findMany.mock.calls[0][0].where,
    ).not.toHaveProperty("startsOn");
  });

  it("can include ended group rules for historical inspection", async () => {
    await listRecurrenceRulesForAssistant({
      groupId: "group-1",
      includeEnded: true,
      calendarDate: new Date("2026-08-08T00:00:00.000Z"),
      limit: 5,
    });

    expect(prismaMock.recurrenceRule.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { groupId: "group-1" },
        take: 5,
      }),
    );
  });

  it("returns recurrence totals so a truncated row cannot appear unique", async () => {
    prismaMock.recurrenceRule.count.mockResolvedValue(3);
    prismaMock.recurrenceRule.findMany.mockResolvedValue([{ id: "rule-1" }]);

    await expect(
      listRecurrenceRulesForAssistant({
        enrollmentId: "enrollment-1",
        includeEnded: false,
        calendarDate: new Date("2026-08-08T00:00:00.000Z"),
        limit: 1,
      }),
    ).resolves.toEqual({
      total: 3,
      hasMore: true,
      rules: [{ id: "rule-1" }],
    });
  });

  it("bounds monthly assistant sessions and omits participant contact data", async () => {
    prismaMock.$transaction.mockResolvedValue([0, [], []]);
    const start = new Date("2026-08-01T00:00:00.000Z");
    const end = new Date("2026-09-01T00:00:00.000Z");

    await getSessionsForAssistantMonth(start, end, 25);

    const query = prismaMock.session.findMany.mock.calls[0][0];
    expect(query.take).toBe(25);
    expect(query.select.attendance.take).toBe(20);
    expect(query.select.attendance.select.student).toEqual({
      select: { id: true, firstName: true, lastName: true },
    });
    expect(query.select.attendance.select.student.select).not.toHaveProperty(
      "email",
    );
  });

  it("bounds nested dashboard attendance while allowing one group attendance call", async () => {
    prismaMock.$transaction.mockResolvedValue([0, []]);
    await getSessionsForAssistantRange(
      new Date("2026-08-01T00:00:00.000Z"),
      new Date("2026-08-02T00:00:00.000Z"),
      50,
    );
    expect(prismaMock.session.findMany.mock.calls[0][0].select.attendance.take).toBe(
      10,
    );

    prismaMock.session.findMany.mockClear();
    prismaMock.session.findUnique.mockResolvedValue(null);
    await getSessionForAssistant("session-1");
    expect(prismaMock.session.findUnique.mock.calls[0][0].select.attendance.take).toBe(
      100,
    );
  });
});
