/*
  Warnings:

  - A unique constraint covering the columns `[recurrenceRuleId,scheduledFor]` on the table `Session` will be added. If there are existing duplicate values, this will fail.

*/
-- CreateIndex
CREATE UNIQUE INDEX "Session_recurrenceRuleId_scheduledFor_key" ON "Session"("recurrenceRuleId", "scheduledFor");
