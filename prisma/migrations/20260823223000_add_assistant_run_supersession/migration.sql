ALTER TABLE "AssistantRun"
ADD COLUMN "supersededAt" TIMESTAMP(3),
ADD COLUMN "supersedesRunId" TEXT;

CREATE UNIQUE INDEX "AssistantRun_supersedesRunId_key"
ON "AssistantRun"("supersedesRunId");

ALTER TABLE "AssistantRun"
ADD CONSTRAINT "AssistantRun_supersedesRunId_fkey"
FOREIGN KEY ("supersedesRunId") REFERENCES "AssistantRun"("id")
ON DELETE SET NULL ON UPDATE CASCADE;
