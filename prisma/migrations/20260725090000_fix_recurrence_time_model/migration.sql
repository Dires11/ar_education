-- Recurrence rules store center-local wall time plus an IANA time zone.
ALTER TABLE "RecurrenceRule"
ADD COLUMN "timeZone" TEXT NOT NULL DEFAULT 'America/Los_Angeles';

ALTER TABLE "Enrollment"
ADD COLUMN "priceAtEnrollment" DECIMAL(10,2);

UPDATE "Enrollment" AS enrollment
SET "priceAtEnrollment" = COALESCE(
  enrollment."customPriceOverride",
  package."basePrice"
)
FROM "Package" AS package
WHERE package."id" = enrollment."packageId";

ALTER TABLE "Enrollment"
ALTER COLUMN "priceAtEnrollment" SET NOT NULL;

-- Existing rules stored UTC HH:mm using the browser offset at creation time.
-- Convert them back to the center-local wall time using the creation date.
UPDATE "RecurrenceRule"
SET "startTime" = to_char(
  (
    (date_trunc('day', "createdAt") + "startTime"::time)
    AT TIME ZONE 'UTC'
  ) AT TIME ZONE 'America/Los_Angeles',
  'HH24:MI'
);

ALTER TABLE "Session"
ADD COLUMN "recurrenceOccurrenceFor" TIMESTAMP(3);

UPDATE "Session"
SET "recurrenceOccurrenceFor" = "scheduledFor"
WHERE "recurrenceRuleId" IS NOT NULL;

DROP INDEX IF EXISTS "Session_recurrenceRuleId_scheduledFor_key";

CREATE UNIQUE INDEX "Session_recurrenceRuleId_recurrenceOccurrenceFor_key"
ON "Session"("recurrenceRuleId", "recurrenceOccurrenceFor");

CREATE INDEX "Payment_enrollmentId_coversMonth_idx"
ON "Payment"("enrollmentId", "coversMonth");

DELETE FROM "Reminder" AS duplicate
USING "Reminder" AS keeper
WHERE duplicate."sessionId" IS NOT NULL
  AND duplicate."sessionId" = keeper."sessionId"
  AND duplicate."recipientEmail" = keeper."recipientEmail"
  AND duplicate."type" = keeper."type"
  AND (
    duplicate."createdAt" > keeper."createdAt"
    OR (
      duplicate."createdAt" = keeper."createdAt"
      AND duplicate."id" > keeper."id"
    )
  );

CREATE UNIQUE INDEX "Reminder_sessionId_recipientEmail_type_key"
ON "Reminder"("sessionId", "recipientEmail", "type");

ALTER TABLE "RecurrenceRule"
ADD CONSTRAINT "RecurrenceRule_dayOfWeek_check"
CHECK ("dayOfWeek" BETWEEN 0 AND 6),
ADD CONSTRAINT "RecurrenceRule_durationMinutes_check"
CHECK ("durationMinutes" > 0),
ADD CONSTRAINT "RecurrenceRule_intervalWeeks_check"
CHECK ("intervalWeeks" > 0),
ADD CONSTRAINT "RecurrenceRule_startTime_check"
CHECK ("startTime" ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'),
ADD CONSTRAINT "RecurrenceRule_owner_check"
CHECK (num_nonnulls("enrollmentId", "groupId") = 1);
