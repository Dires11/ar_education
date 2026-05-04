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
