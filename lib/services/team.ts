import { clerkClient } from "@clerk/nextjs/server";
import {
  listAdmins,
  findAdminById,
  setAdminRole,
  deleteAdmin,
} from "@/lib/data/team";

export async function getTeamPageData() {
  const client = await clerkClient();
  const [admins, invitationList] = await Promise.all([
    listAdmins(),
    client.invitations.getInvitationList({ status: "pending" }),
  ]);
  return { admins, pendingInvitations: invitationList.data };
}

export async function inviteTeamMember(email: string) {
  const client = await clerkClient();
  await client.invitations.createInvitation({
    emailAddress: email,
    redirectUrl: `${process.env.NEXT_PUBLIC_APP_URL}/sign-up`,
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
  await setAdminRole(adminId, role);
}

export async function removeTeamMember(
  currentAdminId: string,
  adminId: string,
) {
  if (adminId === currentAdminId) throw new Error("Cannot remove yourself");
  const admin = await findAdminById(adminId);
  await deleteAdmin(admin.id);
  const client = await clerkClient();
  await client.users.deleteUser(admin.clerkUserId);
}
