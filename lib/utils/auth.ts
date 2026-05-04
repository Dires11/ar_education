import { auth } from "@clerk/nextjs/server";
import { prisma } from "@/lib/prisma";

export async function requireAdmin() {
  const { userId } = await auth();
  if (!userId) throw new Error("Unauthorized");

  let admin = await prisma.admin.findUnique({ where: { clerkUserId: userId } });

  if (!admin) {
    const { clerkClient } = await import("@clerk/nextjs/server");
    const client = await clerkClient();
    const user = await client.users.getUser(userId);
    const email =
      user.emailAddresses.find((e) => e.id === user.primaryEmailAddressId)
        ?.emailAddress ?? "";
    const name =
      [user.firstName, user.lastName].filter(Boolean).join(" ") || email;

    admin = await prisma.admin.create({
      data: { clerkUserId: userId, email, name },
    });
  }

  return admin;
}

export async function requireOwner() {
  const admin = await requireAdmin();
  if (admin.role !== "OWNER") throw new Error("Forbidden");
  return admin;
}
