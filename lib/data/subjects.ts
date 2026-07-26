import "server-only";

import { prisma } from "@/lib/prisma";

export async function listSubjects() {
  return prisma.subject.findMany({ orderBy: { name: "asc" } });
}

export async function createSubject(data: {
  name: string;
  description?: string;
}) {
  return prisma.subject.create({ data });
}

export async function updateSubject(
  id: string,
  data: { name?: string; description?: string }
) {
  return prisma.subject.update({ where: { id }, data });
}

export async function deleteSubject(id: string) {
  return prisma.subject.delete({ where: { id } });
}
