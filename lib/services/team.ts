import "server-only";

import { clerkClient } from "@clerk/nextjs/server";
import {
  listAdmins,
  listAdminsForAssistant,
  disableAdminSafely,
  setAdminRoleSafely,
} from "@/lib/data/team";
import { ADMIN_INVITATION_METADATA } from "@/lib/services/admin-access";

export async function getTeamPageData() {
  const client = await clerkClient();
  const admins = await listAdmins();
  const pendingInvitations = [];
  let offset = 0;
  while (true) {
    const page = await client.invitations.getInvitationList({
      status: "pending",
      limit: 100,
      offset,
    });
    pendingInvitations.push(...page.data);
    offset += page.data.length;
    if (offset >= page.totalCount || page.data.length === 0) break;
  }
  return { admins, pendingInvitations };
}

export async function getTeamPageForAssistant(input: {
  adminId?: string;
  invitationId?: string;
  email?: string;
  page: number;
  limit: number;
}) {
  const client = await clerkClient();
  const [adminPage, invitationPage] = await Promise.all([
    listAdminsForAssistant({
      adminId: input.invitationId ? "__none__" : input.adminId,
      email: input.invitationId ? undefined : input.email,
      page: input.page,
      limit: input.limit,
    }),
    input.adminId
      ? Promise.resolve({ data: [], totalCount: 0 })
      : client.invitations.getInvitationList({
          status: "pending",
          query: input.invitationId ?? input.email,
          limit: input.limit,
          offset: (input.page - 1) * input.limit,
        }),
  ]);
  const pendingInvitations = invitationPage.data.filter(
    (invitation) =>
      (!input.invitationId || invitation.id === input.invitationId) &&
      (!input.email ||
        invitation.emailAddress.toLowerCase() === input.email.toLowerCase()),
  );
  return {
    admins: adminPage,
    pendingInvitations: {
      total: invitationPage.totalCount,
      page: input.page,
      limit: input.limit,
      hasMore: input.page * input.limit < invitationPage.totalCount,
      results: pendingInvitations,
    },
  };
}

export async function getPendingTeamInvitation(input: {
  invitationId?: string;
  email?: string;
}) {
  const query = input.invitationId ?? input.email;
  if (!query) throw new Error("Invitation ID or email is required");
  const client = await clerkClient();
  const page = await client.invitations.getInvitationList({
    status: "pending",
    query,
    limit: 100,
    offset: 0,
  });
  return page.data.find(
    (invitation) =>
      (!input.invitationId || invitation.id === input.invitationId) &&
      (!input.email ||
        invitation.emailAddress.toLowerCase() === input.email.toLowerCase()),
  );
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
