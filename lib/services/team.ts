import "server-only";

import { clerkClient } from "@clerk/nextjs/server";
import {
  listAdmins,
  disableAdminSafely,
  setAdminRoleSafely,
} from "@/lib/data/team";
import { ADMIN_INVITATION_METADATA } from "@/lib/services/admin-access";

export async function getTeamPageData() {
  const client = await clerkClient();
  const [admins, invitationList] = await Promise.all([
    listAdmins(),
    client.invitations.getInvitationList({ status: "pending" }),
  ]);
  return { admins, pendingInvitations: invitationList.data };
}

export async function inviteTeamMember(email: string) {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL;
  if (!appUrl) throw new Error("NEXT_PUBLIC_APP_URL is not configured");

  const client = await clerkClient();
  const pending = await client.invitations.getInvitationList({
    status: "pending",
    query: email,
  });
  const existing = pending.data.find(
    (invitation) =>
      invitation.emailAddress.toLowerCase() === email.toLowerCase(),
  );
  if (existing) return existing;

  return client.invitations.createInvitation({
    emailAddress: email,
    publicMetadata: ADMIN_INVITATION_METADATA,
    redirectUrl: new URL("/sign-up", appUrl).toString(),
  });
}

export async function revokeTeamInvitation(invitationId: string) {
  const client = await clerkClient();
  await client.invitations.revokeInvitation(invitationId);
}

export async function updateTeamMemberRole(
  currentAdminId: string,
  adminId: string,
  role: "OWNER" | "STAFF",
) {
  if (adminId === currentAdminId)
    throw new Error("Cannot change your own role");
  await setAdminRoleSafely(adminId, role);
}

export async function removeTeamMember(
  currentAdminId: string,
  adminId: string,
) {
  if (adminId === currentAdminId) throw new Error("Cannot remove yourself");
  const admin = await disableAdminSafely(adminId);
  try {
    const client = await clerkClient();
    await client.users.deleteUser(admin.clerkUserId);
    return { removed: true, clerkAccountDeleted: true };
  } catch {
    // Keep local access revoked if the remote delete is unavailable. The row
    // preserves payment attribution and assistant audit history, and auth
    // rejects it before Clerk metadata can reprovision the account.
    return { removed: true, clerkAccountDeleted: false };
  }
}
