import "server-only";

import { clerkClient } from "@clerk/nextjs/server";
import {
  listAdmins,
  deleteAdminSafely,
  restoreAdmin,
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
  await client.invitations.createInvitation({
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
  const admin = await deleteAdminSafely(adminId);
  try {
    const client = await clerkClient();
    await client.users.deleteUser(admin.clerkUserId);
  } catch (error) {
    await restoreAdmin(admin);
    throw error;
  }
}
