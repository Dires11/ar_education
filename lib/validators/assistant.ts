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
    retryOfClientTurnId: z.uuid().optional(),
    message: z.string().trim().max(10_000),
    attachments: z
      .array(assistantAttachmentSchema)
      .max(MAX_ASSISTANT_ATTACHMENTS)
      .default([]),
  })
  .superRefine((turn, context) => {
    if (turn.retryOfClientTurnId === turn.clientTurnId) {
      context.addIssue({
        code: "custom",
        path: ["retryOfClientTurnId"],
        message: "A replacement retry must use a new request identifier",
      });
    }
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

const assistantResultCardFieldIconSchema = z.enum([
  "BOOK",
  "CALENDAR",
  "CLOCK",
  "GRADUATION",
  "GUARDIAN",
  "LOCATION",
  "MAIL",
  "MONEY",
  "PACKAGE",
  "PAYMENT",
  "PHONE",
  "STATUS",
  "USER",
]);

export const assistantResultCardSchema = z.object({
  kind: z.enum([
    "STUDENT",
    "GUARDIAN",
    "TUTOR",
    "SUBJECT",
    "PACKAGE",
    "ENROLLMENT",
    "GROUP",
    "SESSION",
    "PAYMENT",
    "EMAIL",
    "TEAM",
  ]),
  entityKey: z.string().trim().min(1).max(160),
  title: z.string().trim().min(1).max(160),
  subtitle: z.string().trim().min(1).max(240).optional(),
  avatar: z
    .object({
      kind: z.enum(["STUDENT", "GUARDIAN", "TUTOR"]),
      firstName: z.string().max(100).nullable().optional(),
      lastName: z.string().max(100).nullable().optional(),
      avatarUrl: z.url().nullable().optional(),
    })
    .optional(),
  badges: z
    .array(
      z.object({
        label: z.string().trim().min(1).max(80),
        tone: z
          .enum(["SUCCESS", "NEUTRAL", "WARNING", "DESTRUCTIVE"])
          .default("NEUTRAL"),
      }),
    )
    .max(4)
    .default([]),
  fields: z
    .array(
      z.object({
        label: z.string().trim().min(1).max(80),
        value: z.string().trim().min(1).max(240),
        icon: assistantResultCardFieldIconSchema,
      }),
    )
    .max(6)
    .default([]),
  href: z
    .string()
    .trim()
    .regex(/^\/(?!\/)/, "Result card links must be internal"),
  actionLabel: z.string().trim().min(1).max(100),
  suggestedActions: z
    .array(
      z.discriminatedUnion("kind", [
        z.object({
          kind: z.literal("PROMPT"),
          label: z.string().trim().min(1).max(100),
          prompt: z.string().trim().min(1).max(500),
        }),
        z.object({
          kind: z.literal("DISMISS"),
          label: z.string().trim().min(1).max(100),
        }),
      ]),
    )
    .max(3)
    .default([]),
});

export type AssistantTurnInput = z.input<typeof assistantTurnSchema>;
export type AssistantDecisionInput = z.infer<typeof assistantDecisionSchema>;
export type AssistantAttachmentInput = z.infer<
  typeof assistantAttachmentSchema
>;
export type AssistantAttachmentMetadata = z.infer<
  typeof assistantAttachmentMetadataSchema
>;
export type AssistantResultCard = z.infer<typeof assistantResultCardSchema>;

function clampCardText(value: unknown, max: number) {
  if (typeof value !== "string") return value;
  const text = value.trim();
  if (text.length <= max) return text;
  return `${text.slice(0, Math.max(0, max - 1)).trimEnd()}…`;
}

/**
 * Keeps cards renderable even when CRM-owned names or generated summaries are
 * longer than the presentation limits. Structural errors still fail closed.
 */
export function normalizeAssistantResultCard(
  value: unknown,
): AssistantResultCard | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const card = value as Record<string, unknown>;
  const avatar: unknown =
    card.avatar && typeof card.avatar === "object" && !Array.isArray(card.avatar)
      ? (card.avatar as Record<string, unknown>)
      : card.avatar;
  const normalized = {
    ...card,
    entityKey: clampCardText(card.entityKey, 160),
    title: clampCardText(card.title, 160),
    subtitle: clampCardText(card.subtitle, 240),
    actionLabel: clampCardText(card.actionLabel, 100),
    avatar:
      avatar && typeof avatar === "object"
        ? {
            ...(avatar as Record<string, unknown>),
            firstName: clampCardText(
              (avatar as Record<string, unknown>).firstName,
              100,
            ),
            lastName: clampCardText(
              (avatar as Record<string, unknown>).lastName,
              100,
            ),
          }
        : avatar,
    badges: Array.isArray(card.badges)
      ? card.badges.slice(0, 4).map((badge) =>
          badge && typeof badge === "object" && !Array.isArray(badge)
            ? {
                ...badge,
                label: clampCardText(
                  (badge as Record<string, unknown>).label,
                  80,
                ),
              }
            : badge,
        )
      : card.badges,
    fields: Array.isArray(card.fields)
      ? card.fields.slice(0, 6).map((field) =>
          field && typeof field === "object" && !Array.isArray(field)
            ? {
                ...field,
                label: clampCardText(
                  (field as Record<string, unknown>).label,
                  80,
                ),
                value: clampCardText(
                  (field as Record<string, unknown>).value,
                  240,
                ),
              }
            : field,
        )
      : card.fields,
    suggestedActions: Array.isArray(card.suggestedActions)
      ? card.suggestedActions.slice(0, 3).map((action) =>
          action && typeof action === "object" && !Array.isArray(action)
            ? {
                ...action,
                label: clampCardText(
                  (action as Record<string, unknown>).label,
                  100,
                ),
                prompt: clampCardText(
                  (action as Record<string, unknown>).prompt,
                  500,
                ),
              }
            : action,
        )
      : card.suggestedActions,
  };
  const parsed = assistantResultCardSchema.safeParse(normalized);
  return parsed.success ? parsed.data : null;
}
