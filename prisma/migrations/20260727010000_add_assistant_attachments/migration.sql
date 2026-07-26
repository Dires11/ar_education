ALTER TABLE "AssistantMessage"
ADD COLUMN "attachments" JSONB;

ALTER TABLE "AssistantRun"
ADD COLUMN "hasAttachments" BOOLEAN NOT NULL DEFAULT false;
