import { beforeEach, describe, expect, it, vi } from "vitest";

const txMock = vi.hoisted(() => ({
  admin: {
    count: vi.fn(),
    findUniqueOrThrow: vi.fn(),
    update: vi.fn(),
  },
}));
const prismaMock = vi.hoisted(() => ({
  admin: {
    count: vi.fn(),
    findMany: vi.fn(),
  },
  $transaction: vi.fn(
    async (callback: (tx: typeof txMock) => Promise<unknown>) => callback(txMock),
  ),
}));

vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }));

import { disableAdminSafely, listAdmins } from "@/lib/data/team";

describe("team access persistence", () => {
  beforeEach(() => vi.clearAllMocks());

  it("lists only enabled administrators", async () => {
    prismaMock.admin.findMany.mockResolvedValue([]);
    await listAdmins();
    expect(prismaMock.admin.findMany).toHaveBeenCalledWith({
      where: { disabledAt: null },
      orderBy: { createdAt: "asc" },
    });
  });

  it("revokes access by durable soft-disable without deleting attribution", async () => {
    txMock.admin.findUniqueOrThrow.mockResolvedValue({
      id: "admin-2",
      role: "STAFF",
      disabledAt: null,
    });
    txMock.admin.update.mockImplementation(({ data }) => ({
      id: "admin-2",
      role: "STAFF",
      ...data,
    }));

    await disableAdminSafely("admin-2");

    expect(txMock.admin.update).toHaveBeenCalledWith({
      where: { id: "admin-2" },
      data: { disabledAt: expect.any(Date) },
    });
    expect(prismaMock.$transaction).toHaveBeenCalledWith(
      expect.any(Function),
      { isolationLevel: "Serializable" },
    );
  });

  it("does not disable the last active owner", async () => {
    txMock.admin.findUniqueOrThrow.mockResolvedValue({
      id: "owner-1",
      role: "OWNER",
      disabledAt: null,
    });
    txMock.admin.count.mockResolvedValue(1);

    await expect(disableAdminSafely("owner-1")).rejects.toThrow(
      "at least one owner",
    );
    expect(txMock.admin.count).toHaveBeenCalledWith({
      where: { role: "OWNER", disabledAt: null },
    });
    expect(txMock.admin.update).not.toHaveBeenCalled();
  });
});
