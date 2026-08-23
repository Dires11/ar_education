import { beforeEach, describe, expect, it, vi } from "vitest";

const dataMocks = vi.hoisted(() => ({
  disableAdminSafely: vi.fn(),
  listAdmins: vi.fn(),
  setAdminRoleSafely: vi.fn(),
}));
const clerkMocks = vi.hoisted(() => ({
  deleteUser: vi.fn(),
  clerkClient: vi.fn(),
}));

vi.mock("@/lib/data/team", () => dataMocks);
vi.mock("@clerk/nextjs/server", () => ({
  clerkClient: clerkMocks.clerkClient,
}));

import { removeTeamMember } from "@/lib/services/team";

describe("team removal", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    dataMocks.disableAdminSafely.mockResolvedValue({
      id: "admin-2",
      clerkUserId: "clerk-2",
    });
    clerkMocks.clerkClient.mockResolvedValue({
      users: { deleteUser: clerkMocks.deleteUser },
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
});
