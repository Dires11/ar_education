CREATE TYPE "AssistantMessageRole" AS ENUM ('USER', 'ASSISTANT');
CREATE TYPE "AssistantRunStatus" AS ENUM ('RUNNING', 'WAITING_CONFIRMATION', 'COMPLETED', 'FAILED');
CREATE TYPE "AssistantToolRunStatus" AS ENUM ('PENDING_CONFIRMATION', 'RUNNING', 'COMPLETED', 'FAILED', 'REJECTED', 'EXPIRED');

CREATE TABLE "AssistantThread" (
    "id" TEXT NOT NULL,
    "adminId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "contextSummary" TEXT,
    "summarizedMessageCount" INTEGER NOT NULL DEFAULT 0,
    "archivedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AssistantThread_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "AssistantMessage" (
    "id" TEXT NOT NULL,
    "threadId" TEXT NOT NULL,
    "runId" TEXT,
    "role" "AssistantMessageRole" NOT NULL,
    "content" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AssistantMessage_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "AssistantRun" (
    "id" TEXT NOT NULL,
    "threadId" TEXT NOT NULL,
    "clientTurnId" TEXT NOT NULL,
    "status" "AssistantRunStatus" NOT NULL DEFAULT 'RUNNING',
    "model" TEXT NOT NULL,
    "resumeInput" JSONB,
    "inputTokens" INTEGER,
    "outputTokens" INTEGER,
    "reasoningTokens" INTEGER,
    "cachedInputTokens" INTEGER,
    "cacheWriteTokens" INTEGER,
    "error" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "completedAt" TIMESTAMP(3),

    CONSTRAINT "AssistantRun_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "AssistantToolRun" (
    "id" TEXT NOT NULL,
    "runId" TEXT NOT NULL,
    "callId" TEXT NOT NULL,
    "namespace" TEXT NOT NULL,
    "toolName" TEXT NOT NULL,
    "arguments" JSONB NOT NULL,
    "preview" JSONB,
    "result" JSONB,
    "status" "AssistantToolRunStatus" NOT NULL,
    "requiresConfirmation" BOOLEAN NOT NULL DEFAULT false,
    "expiresAt" TIMESTAMP(3),
    "confirmedById" TEXT,
    "confirmedAt" TIMESTAMP(3),
    "error" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "completedAt" TIMESTAMP(3),

    CONSTRAINT "AssistantToolRun_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "AssistantThread_adminId_archivedAt_updatedAt_idx" ON "AssistantThread"("adminId", "archivedAt", "updatedAt");
CREATE INDEX "AssistantMessage_threadId_createdAt_idx" ON "AssistantMessage"("threadId", "createdAt");
CREATE INDEX "AssistantMessage_runId_idx" ON "AssistantMessage"("runId");
CREATE UNIQUE INDEX "AssistantRun_threadId_clientTurnId_key" ON "AssistantRun"("threadId", "clientTurnId");
CREATE INDEX "AssistantRun_threadId_status_idx" ON "AssistantRun"("threadId", "status");
CREATE UNIQUE INDEX "AssistantToolRun_runId_callId_key" ON "AssistantToolRun"("runId", "callId");
CREATE INDEX "AssistantToolRun_runId_status_idx" ON "AssistantToolRun"("runId", "status");
CREATE INDEX "AssistantToolRun_expiresAt_status_idx" ON "AssistantToolRun"("expiresAt", "status");

ALTER TABLE "AssistantThread" ADD CONSTRAINT "AssistantThread_adminId_fkey" FOREIGN KEY ("adminId") REFERENCES "Admin"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AssistantMessage" ADD CONSTRAINT "AssistantMessage_threadId_fkey" FOREIGN KEY ("threadId") REFERENCES "AssistantThread"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AssistantMessage" ADD CONSTRAINT "AssistantMessage_runId_fkey" FOREIGN KEY ("runId") REFERENCES "AssistantRun"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "AssistantRun" ADD CONSTRAINT "AssistantRun_threadId_fkey" FOREIGN KEY ("threadId") REFERENCES "AssistantThread"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AssistantToolRun" ADD CONSTRAINT "AssistantToolRun_runId_fkey" FOREIGN KEY ("runId") REFERENCES "AssistantRun"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AssistantToolRun" ADD CONSTRAINT "AssistantToolRun_confirmedById_fkey" FOREIGN KEY ("confirmedById") REFERENCES "Admin"("id") ON DELETE SET NULL ON UPDATE CASCADE;
