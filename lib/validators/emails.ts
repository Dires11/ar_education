import { z } from "zod";
import { idSchema } from "@/lib/validators/common";

export const emailTemplateSchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(200),
  subject: z.string().trim().min(1, "Subject is required").max(500),
  body: z.string().min(1, "Body is required").max(50_000),
  type: z.enum(["PAYMENT_REMINDER", "SESSION_REMINDER", "ANNOUNCEMENT", "CUSTOM"]),
});

export const sendEmailSchema = z.object({
  studentIds: z.array(idSchema).min(1, "Select at least one recipient").max(300)
    .refine((ids) => new Set(ids).size === ids.length, "Duplicate recipients"),
  subject: z.string().trim().min(1, "Subject is required").max(500),
  body: z.string().min(1, "Body is required").max(50_000),
});

export type EmailTemplateInput = z.infer<typeof emailTemplateSchema>;
export type SendEmailInput = z.infer<typeof sendEmailSchema>;
