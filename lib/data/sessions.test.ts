import { beforeEach, describe, expect, it, vi } from "vitest";

const prismaMock = vi.hoisted(() => ({
  recurrenceRule: { count: vi.fn(), findMany: vi.fn(), findUnique: vi.fn() },
  session: { count: vi.fn(), findMany: vi.fn(), findUnique: vi.fn() },
  sessionAttendance: { count: vi.fn(), findMany: vi.fn() },
  $transaction: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }));

import {
  deleteRecurringScheduleData,
  deleteSession,
  getGroupRecurrenceRulesForMonth,
  getRecurrenceRuleForAssistant,
  getRecurrenceRulesForMonth,
  getSessionForAssistant,
  getSessionParticipantsForAssistant,
  getSessionsForAssistantMonth,
  getSessionsForAssistantRange,
  querySessionsForAssistantData,
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
      page: 1,
      limit: 20,
    });

    expect(prismaMock.recurrenceRule.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          enrollmentId: "enrollment-1",
          OR: [{ endsOn: null }, { endsOn: { gte: calendarDate } }],
        },
        take: 20,
        orderBy: [{ updatedAt: "desc" }, { dayOfWeek: "asc" }, { id: "asc" }],
      }),
    );
    expect(
      prismaMock.recurrenceRule.findMany.mock.calls[0][0].where,
    ).not.toHaveProperty("startsOn");
  });

  it("loads the recurrence version used by approval cards", async () => {
    prismaMock.recurrenceRule.findUnique.mockResolvedValue(null);

    await getRecurrenceRuleForAssistant("rule-1");

    expect(prismaMock.recurrenceRule.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "rule-1" },
        select: expect.objectContaining({ updatedAt: true }),
      }),
    );
  });

  it("loads session notes and the version used by approval cards", async () => {
    prismaMock.session.findUnique.mockResolvedValue(null);

    await getSessionForAssistant("session-1");

    expect(prismaMock.session.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "session-1" },
        select: expect.objectContaining({ notes: true, updatedAt: true }),
      }),
    );
  });

  it("locks and rejects a stale session approval before deleting it", async () => {
    const tx = {
      $queryRaw: vi
        .fn()
        .mockResolvedValue([
          { updatedAt: new Date("2026-08-23T13:00:00.000Z") },
        ]),
      session: { delete: vi.fn() },
    };
    prismaMock.$transaction.mockImplementationOnce(
      (callback: (client: typeof tx) => unknown) => callback(tx),
    );

    await expect(
      deleteSession("session-1", new Date("2026-08-23T12:00:00.000Z")),
    ).rejects.toThrow("changed after approval");
    expect(tx.$queryRaw).toHaveBeenCalledTimes(1);
    expect(tx.session.delete).not.toHaveBeenCalled();
  });

  it("locks and rejects a stale recurring-schedule approval before deleting sessions", async () => {
    const tx = {
      $queryRaw: vi
        .fn()
        .mockResolvedValue([
          { updatedAt: new Date("2026-08-23T13:00:00.000Z") },
        ]),
      session: { deleteMany: vi.fn(), updateMany: vi.fn() },
      recurrenceRule: { delete: vi.fn() },
    };
    prismaMock.$transaction.mockImplementationOnce(
      (callback: (client: typeof tx) => unknown) => callback(tx),
    );

    await expect(
      deleteRecurringScheduleData(
        "rule-1",
        new Date("2026-08-24T00:00:00.000Z"),
        new Date("2026-08-23T12:00:00.000Z"),
      ),
    ).rejects.toThrow("changed after approval");
    expect(tx.$queryRaw).toHaveBeenCalledTimes(1);
    expect(tx.session.deleteMany).not.toHaveBeenCalled();
    expect(tx.recurrenceRule.delete).not.toHaveBeenCalled();
  });

  it("can include ended group rules for historical inspection", async () => {
    await listRecurrenceRulesForAssistant({
      groupId: "group-1",
      includeEnded: true,
      calendarDate: new Date("2026-08-08T00:00:00.000Z"),
      page: 1,
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
        page: 1,
        limit: 1,
      }),
    ).resolves.toEqual({
      total: 3,
      page: 1,
      limit: 1,
      hasMore: true,
      rules: [{ id: "rule-1" }],
    });
  });

  it("pages recurrence rules without repeatedly returning the first page", async () => {
    prismaMock.recurrenceRule.count.mockResolvedValue(12);
    prismaMock.recurrenceRule.findMany.mockResolvedValue([{ id: "rule-6" }]);

    await expect(
      listRecurrenceRulesForAssistant({
        enrollmentId: "enrollment-1",
        includeEnded: false,
        calendarDate: new Date("2026-08-08T00:00:00.000Z"),
        page: 2,
        limit: 5,
      }),
    ).resolves.toEqual({
      total: 12,
      page: 2,
      limit: 5,
      hasMore: true,
      rules: [{ id: "rule-6" }],
    });
    expect(prismaMock.recurrenceRule.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ skip: 5, take: 5 }),
    );
  });

  it("bounds monthly assistant sessions and omits participant contact data", async () => {
    prismaMock.$transaction.mockResolvedValue([0, [], []]);
    const start = new Date("2026-08-01T00:00:00.000Z");
    const end = new Date("2026-09-01T00:00:00.000Z");

    await getSessionsForAssistantMonth(start, end, 25, 2);

    const query = prismaMock.session.findMany.mock.calls[0][0];
    expect(query.take).toBe(25);
    expect(query.skip).toBe(25);
    expect(query.select.attendance.take).toBe(20);
    expect(query.select.attendance.select.student).toEqual({
      select: { id: true, firstName: true, lastName: true },
    });
    expect(query.select.attendance.select.student.select).not.toHaveProperty(
      "email",
    );
    expect(prismaMock.session.findMany.mock.calls[1][0]).toMatchObject({
      take: 5_001,
      orderBy: [{ scheduledFor: "asc" }, { id: "asc" }],
    });
  });

  it("bounds recurrence rules and nested group membership for assistant callers", async () => {
    const start = new Date("2026-08-01T00:00:00.000Z");
    const end = new Date("2026-08-31T00:00:00.000Z");

    await getRecurrenceRulesForMonth(start, end, 1_000);
    expect(prismaMock.recurrenceRule.findMany).toHaveBeenLastCalledWith(
      expect.objectContaining({ take: 1_001 }),
    );

    await getGroupRecurrenceRulesForMonth(start, end, {
      rules: 1_000,
      groupEnrollments: 100,
    });
    const groupQuery =
      prismaMock.recurrenceRule.findMany.mock.calls.at(-1)?.[0];
    expect(groupQuery.take).toBe(1_001);
    expect(groupQuery.include.group.include.enrollments).toMatchObject({
      orderBy: { id: "asc" },
      take: 101,
    });
  });

  it("bounds nested dashboard attendance while allowing one group attendance call", async () => {
    prismaMock.$transaction.mockResolvedValue([0, []]);
    await getSessionsForAssistantRange(
      new Date("2026-08-01T00:00:00.000Z"),
      new Date("2026-08-02T00:00:00.000Z"),
      50,
    );
    expect(
      prismaMock.session.findMany.mock.calls[0][0].select.attendance.take,
    ).toBe(10);

    prismaMock.session.findMany.mockClear();
    prismaMock.session.findUnique.mockResolvedValue(null);
    await getSessionForAssistant("session-1");
    expect(
      prismaMock.session.findUnique.mock.calls[0][0].select.attendance.take,
    ).toBe(100);
  });

  it("pages filtered next and prior session history with stable DB ordering", async () => {
    prismaMock.$transaction.mockResolvedValue([205, []]);
    const from = new Date("2026-01-01T00:00:00.000Z");
    const to = new Date("2027-01-01T00:00:00.000Z");

    await expect(
      querySessionsForAssistantData({
        from,
        to,
        studentId: "student-1",
        attendanceStatus: "COMPLETED",
        direction: "ASC",
        page: 2,
        limit: 100,
      }),
    ).resolves.toMatchObject({
      total: 205,
      page: 2,
      limit: 100,
      hasMore: true,
    });
    let query = prismaMock.session.findMany.mock.calls.at(-1)?.[0];
    expect(query).toMatchObject({
      where: {
        scheduledFor: { gte: from, lt: to },
        AND: [
          {
            OR: [
              { enrollment: { studentId: "student-1" } },
              { attendance: { some: { studentId: "student-1" } } },
            ],
          },
          {
            attendance: {
              some: { studentId: "student-1", status: "COMPLETED" },
            },
          },
        ],
      },
      orderBy: [{ scheduledFor: "asc" }, { id: "asc" }],
      skip: 100,
      take: 100,
    });
    expect(query.select.attendance.take).toBe(20);

    prismaMock.$transaction.mockResolvedValue([0, []]);
    await querySessionsForAssistantData({
      from,
      to,
      tutorId: "tutor-1",
      direction: "DESC",
      page: 1,
      limit: 1,
    });
    query = prismaMock.session.findMany.mock.calls.at(-1)?.[0];
    expect(query.orderBy).toEqual([{ scheduledFor: "desc" }, { id: "desc" }]);
  });

  it("pages and filters compact session participants for large attendance rosters", async () => {
    prismaMock.session.findUnique.mockResolvedValue({ id: "session-1" });
    prismaMock.sessionAttendance.count.mockResolvedValue(1);
    prismaMock.sessionAttendance.findMany.mockResolvedValue([
      {
        studentId: "student-101",
        enrollmentId: "enrollment-101",
        status: "SCHEDULED",
        billable: true,
        student: {
          id: "student-101",
          firstName: "Ada",
          lastName: "Lovelace",
        },
      },
    ]);

    await expect(
      getSessionParticipantsForAssistant({
        sessionId: "session-1",
        studentId: "student-101",
        page: 2,
        limit: 100,
      }),
    ).resolves.toMatchObject({
      sessionId: "session-1",
      total: 1,
      page: 2,
      limit: 100,
      hasMore: false,
      participants: [
        {
          studentId: "student-101",
          student: { firstName: "Ada", lastName: "Lovelace" },
        },
      ],
    });

    const query = prismaMock.sessionAttendance.findMany.mock.calls[0][0];
    expect(query.where).toEqual({
      sessionId: "session-1",
      studentId: "student-101",
    });
    expect(query.skip).toBe(100);
    expect(query.take).toBe(100);
    expect(query.select.student.select).not.toHaveProperty("email");
  });
});
