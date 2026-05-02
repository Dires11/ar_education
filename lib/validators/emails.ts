import { z } from "zod";

export const emailTemplateSchema = z.object({
  name: z.string().min(1, "Name is required"),
  subject: z.string().min(1, "Subject is required"),
  body: z.string().min(1, "Body is required"),
  type: z.enum(["PAYMENT_REMINDER", "SESSION_REMINDER", "ANNOUNCEMENT", "CUSTOM"]),
});

export const sendEmailSchema = z.object({
  studentIds: z.array(z.string()).min(1, "Select at least one recipient"),
  subject: z.string().min(1, "Subject is required"),
  body: z.string().min(1, "Body is required"),
});

export type EmailTemplateInput = z.infer<typeof emailTemplateSchema>;
export type SendEmailInput = z.infer<typeof sendEmailSchema>;
