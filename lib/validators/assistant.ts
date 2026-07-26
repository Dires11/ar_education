import { z } from "zod";
import { idSchema } from "@/lib/validators/common";

export const MAX_ASSISTANT_ATTACHMENTS = 4;
export const MAX_ASSISTANT_ATTACHMENT_BYTES = 3 * 1024 * 1024;
export const MAX_ASSISTANT_TOTAL_ATTACHMENT_BYTES = 3 * 1024 * 1024;

export const ASSISTANT_ATTACHMENT_MIME_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/rtf",
  "text/plain",
  "text/markdown",
  "text/csv",
  "application/json",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.ms-powerpoint",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation",
] as const;

const assistantAttachmentMimeSchema = z.enum(
  ASSISTANT_ATTACHMENT_MIME_TYPES,
);

export const assistantAttachmentMetadataSchema = z.object({
  name: z.string().trim().min(1).max(255),
  mimeType: assistantAttachmentMimeSchema,
  sizeBytes: z
    .number()
    .int()
    .positive()
    .max(MAX_ASSISTANT_ATTACHMENT_BYTES),
  kind: z.enum(["IMAGE", "DOCUMENT"]),
});

export const assistantAttachmentSchema = assistantAttachmentMetadataSchema
  .omit({ kind: true })
  .extend({
    dataBase64: z
      .string()
      .min(1)
      .max(Math.ceil((MAX_ASSISTANT_ATTACHMENT_BYTES * 4) / 3) + 4)
      .regex(
        /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/,
        "Attachment data must be valid base64",
      ),
  })
  .superRefine((attachment, context) => {
    const padding = attachment.dataBase64.endsWith("==")
      ? 2
      : attachment.dataBase64.endsWith("=")
        ? 1
        : 0;
    const decodedBytes =
      Math.floor((attachment.dataBase64.length * 3) / 4) - padding;
    if (decodedBytes !== attachment.sizeBytes) {
      context.addIssue({
        code: "custom",
        path: ["sizeBytes"],
        message: "Attachment size does not match its encoded data",
      });
    }
  });

export const assistantTurnSchema = z
  .object({
    threadId: idSchema.optional(),
    clientTurnId: z.uuid(),
    message: z.string().trim().max(10_000),
    attachments: z
      .array(assistantAttachmentSchema)
      .max(MAX_ASSISTANT_ATTACHMENTS)
      .default([]),
  })
  .superRefine((turn, context) => {
    if (!turn.message && turn.attachments.length === 0) {
      context.addIssue({
        code: "custom",
        path: ["message"],
        message: "Enter a message or attach a file",
      });
    }
    const totalBytes = turn.attachments.reduce(
      (total, attachment) => total + attachment.sizeBytes,
      0,
    );
    if (totalBytes > MAX_ASSISTANT_TOTAL_ATTACHMENT_BYTES) {
      context.addIssue({
        code: "custom",
        path: ["attachments"],
        message: "Attachments must be 3 MB or less in total",
      });
    }
  });

export const assistantDecisionSchema = z.object({
  decision: z.enum(["APPROVE", "REJECT"]),
});

export const archiveAssistantThreadSchema = z.object({
  threadId: idSchema,
  archived: z.boolean(),
});

export type AssistantTurnInput = z.input<typeof assistantTurnSchema>;
export type AssistantDecisionInput = z.infer<typeof assistantDecisionSchema>;
export type AssistantAttachmentInput = z.infer<
  typeof assistantAttachmentSchema
>;
export type AssistantAttachmentMetadata = z.infer<
  typeof assistantAttachmentMetadataSchema
>;
