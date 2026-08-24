-- Preserve administrator-linked billing and assistant audit history when access
-- is revoked. Authentication rejects disabled rows before any reprovisioning.
ALTER TABLE "Admin" ADD COLUMN "disabledAt" TIMESTAMP(3);

CREATE INDEX "Admin_disabledAt_idx" ON "Admin"("disabledAt");
