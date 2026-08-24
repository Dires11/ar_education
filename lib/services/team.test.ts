import { beforeEach, describe, expect, it, vi } from "vitest";

const dataMocks = vi.hoisted(() => ({
  disableAdminSafely: vi.fn(),
  listAdmins: vi.fn(),
  listAdminsForAssistant: vi.fn(),
  setAdminRoleSafely: vi.fn(),
}));
const clerkMocks = vi.hoisted(() => ({
  createInvitation: vi.fn(),
  deleteUser: vi.fn(),
  getInvitationList: vi.fn(),
  revokeInvitation: vi.fn(),
  clerkClient: vi.fn(),
}));

vi.mock("@/lib/data/team", () => dataMocks);
vi.mock("@clerk/nextjs/server", () => ({
  clerkClient: clerkMocks.clerkClient,
}));

import {
  getPendingTeamInvitation,
  getTeamAdminForAssistant,
  getTeamPageData,
  getTeamPageForAssistant,
  inviteTeamMember,
  removeTeamMember,
  revokeTeamInvitation,
} from "@/lib/services/team";
import { ExternalMutationOutcomeUnknownError } from "@/lib/utils/email-errors";

describe("team removal", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.NEXT_PUBLIC_APP_URL = "https://crm.example.com";
    dataMocks.disableAdminSafely.mockResolvedValue({
      id: "admin-2",
      clerkUserId: "clerk-2",
    });
    clerkMocks.getInvitationList.mockResolvedValue({
      data: [],
      totalCount: 0,
    });
    clerkMocks.clerkClient.mockResolvedValue({
      users: { deleteUser: clerkMocks.deleteUser },
      invitations: {
        createInvitation: clerkMocks.createInvitation,
        getInvitationList: clerkMocks.getInvitationList,
        revokeInvitation: clerkMocks.revokeInvitation,
      },
    });
  });

  it("marks an interrupted invitation response as an unknown mutation outcome", async () => {
    clerkMocks.createInvitation.mockRejectedValue(
      Object.assign(new Error("socket connection reset after commit"), {
        code: "ECONNRESET",
      }),
    );

    await expect(inviteTeamMember("new@example.com")).rejects.toBeInstanceOf(
      ExternalMutationOutcomeUnknownError,
    );
    expect(clerkMocks.createInvitation).toHaveBeenCalledWith({
      emailAddress: "new@example.com",
      publicMetadata: expect.any(Object),
      redirectUrl: "https://crm.example.com/sign-up",
    });
  });

  it("marks an interrupted invitation revocation as an unknown mutation outcome", async () => {
    clerkMocks.revokeInvitation.mockRejectedValue(
      Object.assign(new Error("Clerk timed out after commit"), { status: 503 }),
    );

    await expect(revokeTeamInvitation("invitation-1")).rejects.toBeInstanceOf(
      ExternalMutationOutcomeUnknownError,
    );
  });

  it("preserves deterministic Clerk invitation errors", async () => {
    const validationError = Object.assign(new Error("invalid invitation"), {
      status: 422,
    });
    clerkMocks.createInvitation.mockRejectedValue(validationError);

    await expect(inviteTeamMember("new@example.com")).rejects.toBe(
      validationError,
    );
  });

  it("keeps local access disabled when Clerk deletion fails", async () => {
    clerkMocks.deleteUser.mockRejectedValue(new Error("Clerk unavailable"));

    await expect(removeTeamMember("admin-1", "admin-2")).resolves.toEqual({
      removed: true,
      clerkAccountDeleted: false,
    });
    expect(dataMocks.disableAdminSafely).toHaveBeenCalledWith("admin-2");
    expect(
      dataMocks.disableAdminSafely.mock.invocationCallOrder[0],
    ).toBeLessThan(clerkMocks.deleteUser.mock.invocationCallOrder[0]);
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
      data: [
        {
          id: "invitation-11",
          emailAddress: "eleven@example.com",
          status: "pending",
        },
      ],
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

  it("loads one exact admin without scanning Clerk invitations or the team", async () => {
    dataMocks.listAdminsForAssistant.mockResolvedValue({
      total: 1,
      page: 1,
      limit: 1,
      hasMore: false,
      admins: [
        {
          id: "admin-2",
          name: "Ada Owner",
          email: "ada@example.com",
          role: "OWNER",
        },
      ],
    });

    await expect(getTeamAdminForAssistant("admin-2")).resolves.toMatchObject({
      id: "admin-2",
    });
    expect(dataMocks.listAdminsForAssistant).toHaveBeenCalledWith({
      adminId: "admin-2",
      page: 1,
      limit: 1,
    });
    expect(clerkMocks.getInvitationList).not.toHaveBeenCalled();
    expect(dataMocks.listAdmins).not.toHaveBeenCalled();
  });
});
