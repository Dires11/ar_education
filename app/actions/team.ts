"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireOwner } from "@/lib/utils/auth";
import {
  inviteTeamMember as svcInvite,
  revokeTeamInvitation as svcRevoke,
  updateTeamMemberRole as svcUpdateRole,
  removeTeamMember as svcRemove,
} from "@/lib/services/team";
import { idSchema } from "@/lib/validators/common";

const emailSchema = z.string().email();

export async function inviteTeamMember(email: string) {
  emailSchema.parse(email);
  await requireOwner();
  await svcInvite(email);
  revalidatePath("/team");
}

export async function revokeTeamInvitation(invitationId: string) {
  await requireOwner();
  await svcRevoke(idSchema.parse(invitationId));
  revalidatePath("/team");
}

export async function updateTeamMemberRole(adminId: string, role: "OWNER" | "STAFF") {
  const currentAdmin = await requireOwner();
  await svcUpdateRole(
    currentAdmin.id,
    idSchema.parse(adminId),
    z.enum(["OWNER", "STAFF"]).parse(role),
  );
  revalidatePath("/team");
}

export async function removeTeamMember(adminId: string) {
  const currentAdmin = await requireOwner();
  await svcRemove(currentAdmin.id, idSchema.parse(adminId));
  revalidatePath("/team");
}
