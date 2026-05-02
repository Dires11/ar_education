"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/utils/auth";
import {
  listEmailTemplates,
  createEmailTemplate,
  updateEmailTemplate,
  deleteEmailTemplate,
} from "@/lib/data/emails";
import { sendEmailToStudents } from "@/lib/services/emails";
import {
  emailTemplateSchema,
  sendEmailSchema,
  type EmailTemplateInput,
  type SendEmailInput,
} from "@/lib/validators/emails";

export async function listEmailTemplatesAction() {
  await requireAdmin();
  return listEmailTemplates();
}

export async function createEmailTemplateAction(input: EmailTemplateInput) {
  await requireAdmin();
  const parsed = emailTemplateSchema.parse(input);
  const template = await createEmailTemplate(parsed);
  revalidatePath("/emails");
  return { success: true, id: template.id };
}

export async function updateEmailTemplateAction(
  id: string,
  input: EmailTemplateInput
) {
  await requireAdmin();
  const parsed = emailTemplateSchema.parse(input);
  await updateEmailTemplate(id, parsed);
  revalidatePath("/emails");
  return { success: true };
}

export async function deleteEmailTemplateAction(id: string) {
  await requireAdmin();
  await deleteEmailTemplate(id);
  revalidatePath("/emails");
  return { success: true };
}

export async function sendEmailAction(input: SendEmailInput) {
  await requireAdmin();
  const parsed = sendEmailSchema.parse(input);
  const result = await sendEmailToStudents(parsed);
  return { success: true, ...result };
}
