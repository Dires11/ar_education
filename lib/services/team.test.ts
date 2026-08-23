import { beforeEach, describe, expect, it, vi } from "vitest";

const dataMocks = vi.hoisted(() => ({
  disableAdminSafely: vi.fn(),
  listAdmins: vi.fn(),
  listAdminsForAssistant: vi.fn(),
  setAdminRoleSafely: vi.fn(),
}));
const clerkMocks = vi.hoisted(() => ({
  deleteUser: vi.fn(),
  getInvitationList: vi.fn(),
  clerkClient: vi.fn(),
}));

vi.mock("@/lib/data/team", () => dataMocks);
vi.mock("@clerk/nextjs/server", () => ({
  clerkClient: clerkMocks.clerkClient,
}));

import {
  getPendingTeamInvitation,
  getTeamPageData,
  getTeamPageForAssistant,
  removeTeamMember,
} from "@/lib/services/team";

describe("team removal", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    dataMocks.disableAdminSafely.mockResolvedValue({
      id: "admin-2",
      clerkUserId: "clerk-2",
    });
    clerkMocks.clerkClient.mockResolvedValue({
      users: { deleteUser: clerkMocks.deleteUser },
      invitations: { getInvitationList: clerkMocks.getInvitationList },
    });
  });

  it("keeps local access disabled when Clerk deletion fails", async () => {
    clerkMocks.deleteUser.mockRejectedValue(new Error("Clerk unavailable"));

    await expect(removeTeamMember("admin-1", "admin-2")).resolves.toEqual({
      removed: true,
      clerkAccountDeleted: false,
    });
    expect(dataMocks.disableAdminSafely).toHaveBeenCalledWith("admin-2");
    expect(dataMocks.disableAdminSafely.mock.invocationCallOrder[0]).toBeLessThan(
      clerkMocks.deleteUser.mock.invocationCallOrder[0],
    );
  });

  it("reports completed Clerk cleanup after local access is disabled", async () => {
    clerkMocks.deleteUser.mockResolvedValue(undefined);

    await expect(removeTeamMember("admin-1", "admin-2")).resolves.toEqual({
      removed: true,
      clerkAccountDeleted: true,
    });
  });

  it("loads every pending invitation for the manual team page", async () => {
    dataMocks.listAdmins.mockResolvedValue([]);
    const firstPage = Array.from({ length: 100 }, (_, index) => ({
      id: `invitation-${index + 1}`,
      emailAddress: `person-${index + 1}@example.com`,
    }));
    const secondPage = Array.from({ length: 25 }, (_, index) => ({
      id: `invitation-${index + 101}`,
      emailAddress: `person-${index + 101}@example.com`,
    }));
    clerkMocks.getInvitationList
      .mockResolvedValueOnce({ data: firstPage, totalCount: 125 })
      .mockResolvedValueOnce({ data: secondPage, totalCount: 125 });

    await expect(getTeamPageData()).resolves.toMatchObject({
      pendingInvitations: expect.arrayContaining([
        expect.objectContaining({ id: "invitation-125" }),
      ]),
    });
    expect(clerkMocks.getInvitationList).toHaveBeenNthCalledWith(2, {
      status: "pending",
      limit: 100,
      offset: 100,
    });
  });

  it("pages invitations and resolves an exact invitation beyond the first ten", async () => {
    dataMocks.listAdminsForAssistant.mockResolvedValue({
      total: 0,
      page: 2,
      limit: 10,
      hasMore: false,
      admins: [],
    });
    clerkMocks.getInvitationList.mockResolvedValue({
      data: [{
        id: "invitation-11",
        emailAddress: "eleven@example.com",
        status: "pending",
      }],
      totalCount: 11,
    });

    await expect(
      getTeamPageForAssistant({ page: 2, limit: 10 }),
    ).resolves.toMatchObject({
      pendingInvitations: {
        total: 11,
        page: 2,
        hasMore: false,
        results: [expect.objectContaining({ id: "invitation-11" })],
      },
    });
    expect(clerkMocks.getInvitationList).toHaveBeenCalledWith({
      status: "pending",
      query: undefined,
      limit: 10,
      offset: 10,
    });

    await expect(
      getPendingTeamInvitation({ invitationId: "invitation-11" }),
    ).resolves.toMatchObject({ id: "invitation-11" });
    expect(clerkMocks.getInvitationList).toHaveBeenLastCalledWith({
      status: "pending",
      query: "invitation-11",
      limit: 100,
      offset: 0,
    });
  });
});
