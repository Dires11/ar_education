import "server-only";

import { prisma } from "@/lib/prisma";

export async function listAdmins() {
  return prisma.admin.findMany({
    where: { disabledAt: null },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
  });
}

export async function listAdminsForAssistant(input: {
  adminId?: string;
  email?: string;
  page: number;
  limit: number;
}) {
  const where = {
    disabledAt: null,
    ...(input.adminId ? { id: input.adminId } : {}),
    ...(input.email
      ? { email: { equals: input.email, mode: "insensitive" as const } }
      : {}),
  };
  const [total, admins] = await prisma.$transaction([
    prisma.admin.count({ where }),
    prisma.admin.findMany({
      where,
      select: { id: true, name: true, email: true, role: true },
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
      skip: (input.page - 1) * input.limit,
      take: input.limit,
    }),
  ]);
  return {
    total,
    page: input.page,
    limit: input.limit,
    hasMore: input.page * input.limit < total,
    admins,
  };
}

export async function findAdminById(id: string) {
  return prisma.admin.findUniqueOrThrow({ where: { id } });
}

export function countOwners() {
  return prisma.admin.count({
    where: { role: "OWNER", disabledAt: null },
  });
}

export function countAdmins() {
  return prisma.admin.count({ where: { disabledAt: null } });
}

export function setAdminRoleSafely(id: string, role: "OWNER" | "STAFF") {
  return prisma.$transaction(
    async (tx) => {
      const admin = await tx.admin.findUniqueOrThrow({ where: { id } });
      if (admin.disabledAt) throw new Error("Team member is already disabled");
      if (admin.role === "OWNER" && role === "STAFF") {
        const owners = await tx.admin.count({
          where: { role: "OWNER", disabledAt: null },
        });
        if (owners <= 1) {
          throw new Error("The team must keep at least one owner");
        }
      }
      return tx.admin.update({ where: { id }, data: { role } });
    },
    { isolationLevel: "Serializable" },
  );
}

export function disableAdminSafely(id: string) {
  return prisma.$transaction(
    async (tx) => {
      const admin = await tx.admin.findUniqueOrThrow({ where: { id } });
      if (admin.disabledAt) return admin;
      if (admin.role === "OWNER") {
        const owners = await tx.admin.count({
          where: { role: "OWNER", disabledAt: null },
        });
        if (owners <= 1) {
          throw new Error("The team must keep at least one owner");
        }
      }
      return tx.admin.update({
        where: { id },
        data: { disabledAt: new Date() },
      });
    },
    { isolationLevel: "Serializable" },
  );
}

export function findAdminByClerkUserId(clerkUserId: string) {
  return prisma.admin.findUnique({ where: { clerkUserId } });
}

export function createAdminFromClerk(input: {
  clerkUserId: string;
  email: string;
  name: string;
  role: "OWNER" | "STAFF";
}) {
  return prisma.$transaction(
    async (tx) => {
      const existing = await tx.admin.findUnique({
        where: { clerkUserId: input.clerkUserId },
      });
      if (existing) return existing;

      if (input.role === "OWNER") {
        const adminCount = await tx.admin.count({
          where: { disabledAt: null },
        });
        if (adminCount > 0) {
          throw new Error("The initial owner has already been provisioned");
        }
      }

      return tx.admin.create({ data: input });
    },
    { isolationLevel: "Serializable" },
  );
}
