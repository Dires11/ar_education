import { describe, expect, it } from "vitest";
import {
  ADMIN_INVITATION_METADATA,
  resolveAdminProvisioningRole,
} from "@/lib/services/admin-access";

describe("admin provisioning", () => {
  it("provisions an invited user as staff", () => {
    expect(
      resolveAdminProvisioningRole({
        publicMetadata: ADMIN_INVITATION_METADATA,
        email: "staff@example.com",
        existingAdminCount: 1,
        bootstrapOwnerEmails: undefined,
      }),
    ).toBe("STAFF");
  });

  it("does not provision an authenticated but uninvited user", () => {
    expect(
      resolveAdminProvisioningRole({
        publicMetadata: {},
        email: "stranger@example.com",
        existingAdminCount: 1,
        bootstrapOwnerEmails: undefined,
      }),
    ).toBeNull();
  });

  it("allows one configured owner to bootstrap an empty database", () => {
    expect(
      resolveAdminProvisioningRole({
        publicMetadata: {},
        email: "OWNER@example.com",
        existingAdminCount: 0,
        bootstrapOwnerEmails: "other@example.com, owner@example.com ",
      }),
    ).toBe("OWNER");
  });

  it("does not use the bootstrap allowlist after the first admin exists", () => {
    expect(
      resolveAdminProvisioningRole({
        publicMetadata: {},
        email: "owner@example.com",
        existingAdminCount: 1,
        bootstrapOwnerEmails: "owner@example.com",
      }),
    ).toBeNull();
  });

  it("rejects malformed invitation metadata", () => {
    expect(
      resolveAdminProvisioningRole({
        publicMetadata: {
          arEducation: {
            adminInvitation: "unexpected-version",
          },
        },
        email: "staff@example.com",
        existingAdminCount: 1,
        bootstrapOwnerEmails: undefined,
      }),
    ).toBeNull();
  });
});
