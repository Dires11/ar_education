import { prisma } from "@/lib/prisma";

export async function listPackages(activeOnly = false) {
  return prisma.package.findMany({
    where: activeOnly ? { isActive: true } : undefined,
    include: { subject: true },
    orderBy: [{ type: "asc" }, { name: "asc" }],
  });
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
