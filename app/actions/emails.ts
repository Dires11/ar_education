"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/utils/auth";
import {
  createTemplate,
  deleteTemplate,
  listEmailTemplates,
  sendEmailToStudents,
  updateTemplate,
} from "@/lib/services/emails";
import {
  sendEmailSchema,
  type EmailTemplateInput,
  type SendEmailInput,
} from "@/lib/validators/emails";
import { idSchema } from "@/lib/validators/common";

export async function listEmailTemplatesAction() {
  await requireAdmin();
  return listEmailTemplates();
}

export async function createEmailTemplateAction(input: EmailTemplateInput) {
  await requireAdmin();
  const template = await createTemplate(input);
  revalidatePath("/emails");
  return { success: true, id: template.id };
}

export async function updateEmailTemplateAction(
  id: string,
  input: EmailTemplateInput
) {
  await requireAdmin();
  await updateTemplate(idSchema.parse(id), input);
  revalidatePath("/emails");
  return { success: true };
}

export async function deleteEmailTemplateAction(id: string) {
  await requireAdmin();
  await deleteTemplate(idSchema.parse(id));
  revalidatePath("/emails");
  return { success: true };
}

export async function sendEmailAction(input: SendEmailInput) {
  await requireAdmin();
  const parsed = sendEmailSchema.parse(input);
  const result = await sendEmailToStudents(parsed);
  return { success: true, ...result };
}
