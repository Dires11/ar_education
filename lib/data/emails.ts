import { prisma } from "@/lib/prisma";
import type { EmailTemplateType } from "../../generated/prisma";

export async function listEmailTemplates() {
  return prisma.emailTemplate.findMany({ orderBy: { createdAt: "desc" } });
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
