import { beforeEach, describe, expect, it, vi } from "vitest";

const clerkMocks = vi.hoisted(() => ({
  auth: vi.fn(),
  clerkClient: vi.fn(),
}));
const teamDataMocks = vi.hoisted(() => ({
  countAdmins: vi.fn(),
  createAdminFromClerk: vi.fn(),
  findAdminByClerkUserId: vi.fn(),
}));

vi.mock("@clerk/nextjs/server", () => clerkMocks);
vi.mock("@/lib/data/team", () => teamDataMocks);

import { requireAdmin } from "@/lib/utils/auth";

describe("administrator authorization", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    clerkMocks.auth.mockResolvedValue({ userId: "clerk-1" });
  });

  it("rejects a disabled local identity before Clerk can reprovision it", async () => {
    teamDataMocks.findAdminByClerkUserId.mockResolvedValue({
      id: "admin-1",
      clerkUserId: "clerk-1",
      role: "STAFF",
      disabledAt: new Date(),
    });

    await expect(requireAdmin()).rejects.toThrow("Forbidden");
    expect(clerkMocks.clerkClient).not.toHaveBeenCalled();
    expect(teamDataMocks.createAdminFromClerk).not.toHaveBeenCalled();
  });

  it("allows an enabled administrator", async () => {
    const admin = {
      id: "admin-1",
      clerkUserId: "clerk-1",
      role: "STAFF",
      disabledAt: null,
    };
    teamDataMocks.findAdminByClerkUserId.mockResolvedValue(admin);

    await expect(requireAdmin()).resolves.toBe(admin);
  });
});
