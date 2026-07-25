export const ADMIN_INVITATION_METADATA = {
  arEducation: {
    adminInvitation: "v1",
  },
} as const;

type AdminRole = "OWNER" | "STAFF";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function wasInvitedToAdminTeam(
  publicMetadata: Record<string, unknown> | null | undefined,
): boolean {
  const arEducation = publicMetadata?.arEducation;
  return (
    isRecord(arEducation) &&
    arEducation.adminInvitation ===
      ADMIN_INVITATION_METADATA.arEducation.adminInvitation
  );
}

function getBootstrapOwnerEmails(value: string | undefined): Set<string> {
  return new Set(
    (value ?? "")
      .split(",")
      .map((email) => email.trim().toLowerCase())
      .filter(Boolean),
  );
}

export function resolveAdminProvisioningRole(input: {
  publicMetadata: Record<string, unknown> | null | undefined;
  email: string;
  existingAdminCount: number;
  bootstrapOwnerEmails: string | undefined;
}): AdminRole | null {
  if (
    input.existingAdminCount === 0 &&
    getBootstrapOwnerEmails(input.bootstrapOwnerEmails).has(
      input.email.trim().toLowerCase(),
    )
  ) {
    return "OWNER";
  }

  return wasInvitedToAdminTeam(input.publicMetadata) ? "STAFF" : null;
}
