import {
  assistantAttachmentMetadataSchema,
  type AssistantAttachmentMetadata,
} from "@/lib/validators/assistant";

const OMITTED_ASSISTANT_FIELDS = new Set([
  "avatarPublicId",
  "clerkUserId",
  "recordedById",
]);

export function minimizeAssistantDto(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(minimizeAssistantDto);
  }
  if (!value || typeof value !== "object") {
    return value;
  }

  return Object.fromEntries(
    Object.entries(value)
      .filter(([key]) => !OMITTED_ASSISTANT_FIELDS.has(key))
      .map(([key, item]) => [key, minimizeAssistantDto(item)]),
  );
}

export function parseAssistantAttachmentMetadata(
  value: unknown,
): AssistantAttachmentMetadata[] {
  const parsed = assistantAttachmentMetadataSchema.array().safeParse(value);
  return parsed.success ? parsed.data : [];
}
