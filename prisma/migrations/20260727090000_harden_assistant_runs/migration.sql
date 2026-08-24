ALTER TABLE "AssistantRun"
ADD COLUMN "toolCallCount" INTEGER NOT NULL DEFAULT 0;

DROP INDEX IF EXISTS "AssistantRun_threadId_clientTurnId_key";
CREATE UNIQUE INDEX "AssistantRun_clientTurnId_key"
ON "AssistantRun"("clientTurnId");
