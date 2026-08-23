import "server-only";

import { prisma } from "@/lib/prisma";

export async function listSubjects() {
  return prisma.subject.findMany({ orderBy: { name: "asc" } });
}

export async function listSubjectsForAssistant(input: {
  id?: string;
  limit: number;
}) {
  const where = input.id ? { id: input.id } : undefined;
  const [total, subjects] = await prisma.$transaction([
    prisma.subject.count({ where }),
    prisma.subject.findMany({
      where,
      select: { id: true, name: true },
      orderBy: { name: "asc" },
      take: input.limit,
    }),
  ]);
  return { total, hasMore: total > subjects.length, subjects };
}

export async function getSubject(id: string) {
  return prisma.subject.findUnique({ where: { id } });
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
