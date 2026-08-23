import "server-only";

import { prisma } from "@/lib/prisma";
import type { EmailTemplateType } from "../../generated/prisma";

export async function listEmailTemplates() {
  return prisma.emailTemplate.findMany({ orderBy: { createdAt: "desc" } });
}

export async function listEmailTemplatesForAssistant(limit: number) {
  const [total, templates] = await prisma.$transaction([
    prisma.emailTemplate.count(),
    prisma.emailTemplate.findMany({
      select: {
        id: true,
        name: true,
        type: true,
        subject: true,
        updatedAt: true,
      },
      orderBy: { createdAt: "desc" },
      take: limit,
    }),
  ]);
  return { total, hasMore: total > templates.length, templates };
}

export async function getEmailTemplate(id: string) {
  return prisma.emailTemplate.findUnique({ where: { id } });
}

export async function createEmailTemplate(data: {
  name: string;
  subject: string;
  body: string;
  type: EmailTemplateType;
}) {
  return prisma.emailTemplate.create({ data });
}

export async function updateEmailTemplate(
  id: string,
  data: Partial<{ name: string; subject: string; body: string; type: EmailTemplateType }>
) {
  return prisma.emailTemplate.update({ where: { id }, data });
}

export async function deleteEmailTemplate(id: string) {
  return prisma.emailTemplate.delete({ where: { id } });
}

export async function getEmailRecipientContext(studentIds: string[]) {
  return Promise.all([
    prisma.studentGuardian.findMany({
      where: { isPrimary: true, studentId: { in: studentIds } },
      include: {
        guardian: { select: { email: true, firstName: true } },
      },
    }),
    prisma.enrollment.findMany({
      where: { studentId: { in: studentIds }, status: "ACTIVE" },
      include: {
        tutor: { select: { firstName: true, lastName: true } },
        subject: { select: { name: true } },
        package: { select: { name: true } },
      },
      orderBy: { createdAt: "desc" },
    }),
  ]);
}

export async function getStudentsForEmail(studentIds: string[]) {
  return prisma.student.findMany({
    where: { id: { in: studentIds } },
    include: {
      guardians: {
        where: { isPrimary: true },
        include: { guardian: true },
      },
      enrollments: {
        where: { status: "ACTIVE" },
        include: { tutor: true, subject: true, package: true },
        take: 1,
        orderBy: { createdAt: "desc" },
      },
    },
  });
}

export function getLatestEmailTemplate(
  type: "PAYMENT_REMINDER" | "SESSION_REMINDER" | "ANNOUNCEMENT" | "CUSTOM",
) {
  return prisma.emailTemplate.findFirst({
    where: { type },
    orderBy: { updatedAt: "desc" },
  });
}
