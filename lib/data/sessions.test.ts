import { beforeEach, describe, expect, it, vi } from "vitest";

const prismaMock = vi.hoisted(() => ({
  recurrenceRule: { findMany: vi.fn() },
}));

vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }));

import { listRecurrenceRulesForAssistant } from "@/lib/data/sessions";

describe("assistant recurrence lookup", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    prismaMock.recurrenceRule.findMany.mockResolvedValue([]);
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
});
