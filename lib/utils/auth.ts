import "server-only";

import { auth } from "@clerk/nextjs/server";
import {
  countAdmins,
  createAdminFromClerk,
  findAdminByClerkUserId,
} from "@/lib/data/team";
import { resolveAdminProvisioningRole } from "@/lib/services/admin-access";

export async function requireAdmin() {
  const { userId } = await auth();
  if (!userId) throw new Error("Unauthorized");

  let admin = await findAdminByClerkUserId(userId);

  if (!admin) {
    const { clerkClient } = await import("@clerk/nextjs/server");
    const client = await clerkClient();
    const user = await client.users.getUser(userId);
    const email =
      user.emailAddresses.find((e) => e.id === user.primaryEmailAddressId)
        ?.emailAddress ?? user.emailAddresses[0]?.emailAddress;
    if (!email) throw new Error("Forbidden");

    const name =
      [user.firstName, user.lastName].filter(Boolean).join(" ") || email;
    const existingAdminCount = await countAdmins();
    const role = resolveAdminProvisioningRole({
      publicMetadata: user.publicMetadata,
      email,
      existingAdminCount,
      bootstrapOwnerEmails: process.env.INITIAL_OWNER_EMAILS,
    });

    if (!role) throw new Error("Forbidden");

    admin = await createAdminFromClerk({
      clerkUserId: userId,
      email,
      name,
      role,
    });
  }

  return admin;
}

export async function requireOwner() {
  const admin = await requireAdmin();
  if (admin.role !== "OWNER") throw new Error("Forbidden");
  return admin;
}
