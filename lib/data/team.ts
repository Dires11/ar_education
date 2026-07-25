import "server-only";

import { prisma } from "@/lib/prisma";

export async function listAdmins() {
  return prisma.admin.findMany({ orderBy: { createdAt: "asc" } });
}

export async function findAdminById(id: string) {
  return prisma.admin.findUniqueOrThrow({ where: { id } });
}

export async function setAdminRole(id: string, role: "OWNER" | "STAFF") {
  return prisma.admin.update({ where: { id }, data: { role } });
}

export async function deleteAdmin(id: string) {
  return prisma.admin.delete({ where: { id } });
}

export function restoreAdmin(admin: {
  id: string;
  clerkUserId: string;
  email: string;
  name: string;
  role: "OWNER" | "STAFF";
  createdAt: Date;
  updatedAt: Date;
}) {
  return prisma.admin.create({ data: admin });
}

export function countOwners() {
  return prisma.admin.count({ where: { role: "OWNER" } });
}

export function countAdmins() {
  return prisma.admin.count();
}

export function setAdminRoleSafely(id: string, role: "OWNER" | "STAFF") {
  return prisma.$transaction(
    async (tx) => {
      const admin = await tx.admin.findUniqueOrThrow({ where: { id } });
      if (admin.role === "OWNER" && role === "STAFF") {
        const owners = await tx.admin.count({ where: { role: "OWNER" } });
        if (owners <= 1) {
          throw new Error("The team must keep at least one owner");
        }
      }
      return tx.admin.update({ where: { id }, data: { role } });
    },
    { isolationLevel: "Serializable" },
  );
}

export function deleteAdminSafely(id: string) {
  return prisma.$transaction(
    async (tx) => {
      const admin = await tx.admin.findUniqueOrThrow({ where: { id } });
      if (admin.role === "OWNER") {
        const owners = await tx.admin.count({ where: { role: "OWNER" } });
        if (owners <= 1) {
          throw new Error("The team must keep at least one owner");
        }
      }
      return tx.admin.delete({ where: { id } });
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
        const adminCount = await tx.admin.count();
        if (adminCount > 0) {
          throw new Error("The initial owner has already been provisioned");
        }
      }

      return tx.admin.create({ data: input });
    },
    { isolationLevel: "Serializable" },
  );
}
