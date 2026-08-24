import "server-only";

import { prisma } from "@/lib/prisma";

export async function listPackages(activeOnly = false) {
  return prisma.package.findMany({
    where: activeOnly ? { isActive: true } : undefined,
    include: { subject: true },
    orderBy: [{ type: "asc" }, { name: "asc" }],
  });
}

export async function listPackagesForAssistant(input: {
  activeOnly: boolean;
  page: number;
  limit: number;
}) {
  const where = input.activeOnly ? { isActive: true } : undefined;
  const [total, packages] = await prisma.$transaction([
    prisma.package.count({ where }),
    prisma.package.findMany({
      where,
      select: {
        id: true,
        name: true,
        type: true,
        billingPeriod: true,
        lessonType: true,
        subject: { select: { id: true, name: true } },
        basePrice: true,
        sessionsPerWeek: true,
        durationMinutes: true,
        isActive: true,
      },
      orderBy: [{ type: "asc" }, { name: "asc" }, { id: "asc" }],
      skip: (input.page - 1) * input.limit,
      take: input.limit,
    }),
  ]);
  return {
    total,
    page: input.page,
    limit: input.limit,
    hasMore: input.page * input.limit < total,
    packages,
  };
}

export async function getPackage(id: string) {
  return prisma.package.findUnique({
    where: { id },
    include: { subject: true },
  });
}

export async function createPackage(data: {
  name: string;
  type: "MONTHLY" | "PER_SESSION";
  billingPeriod?: "MONTHLY" | "THREE_MONTHS" | "YEARLY";
  lessonType: "PRIVATE" | "GROUP";
  subjectId?: string;
  basePrice: string;
  sessionsPerWeek?: number | null;
  durationMinutes: number;
}) {
  return prisma.package.create({ data });
}

export async function updatePackage(
  id: string,
  data: {
    name?: string;
    type?: "MONTHLY" | "PER_SESSION";
    billingPeriod?: "MONTHLY" | "THREE_MONTHS" | "YEARLY";
    lessonType?: "PRIVATE" | "GROUP";
    subjectId?: string | null;
    basePrice?: string;
    sessionsPerWeek?: number | null;
    durationMinutes?: number;
    isActive?: boolean;
  }
) {
  return prisma.package.update({ where: { id }, data });
}
