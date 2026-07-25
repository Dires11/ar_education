-- Repair legacy recurrence data created before the wall-time migration.
--
-- The previous migration used each rule's creation date when translating the
-- browser-encoded UTC time. The browser encoded the time on the most recent
-- edit date, so use updatedAt to recover the correct daylight-saving offset.
-- Rules edited after that migration already contain a local wall time and must
-- not be translated again.
BEGIN;

CREATE TEMP TABLE "_legacy_recurrence_migration" ON COMMIT DROP AS
SELECT ("started_at" AT TIME ZONE 'UTC')::timestamp AS "startedAt"
FROM "_prisma_migrations"
WHERE "migration_name" = '20260725090000_fix_recurrence_time_model'
  AND "finished_at" IS NOT NULL
LIMIT 1;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM "_legacy_recurrence_migration") THEN
    RAISE EXCEPTION
      'The prerequisite recurrence migration is missing or incomplete';
  END IF;
END
$$;

WITH "legacyRuleTimes" AS (
  SELECT
    rule."id",
    to_char(
      (
        (
          date_trunc('day', rule."createdAt") + rule."startTime"::time
        ) AT TIME ZONE 'America/Los_Angeles'
      ) AT TIME ZONE 'UTC',
      'HH24:MI'
    ) AS "encodedUtcTime"
  FROM "RecurrenceRule" AS rule
  CROSS JOIN "_legacy_recurrence_migration" AS migration
  WHERE rule."updatedAt" < migration."startedAt"
)
UPDATE "RecurrenceRule" AS rule
SET "startTime" = to_char(
  (
    (
      date_trunc(
        'day',
        (rule."updatedAt" AT TIME ZONE 'UTC') AT TIME ZONE rule."timeZone"
      ) + legacy."encodedUtcTime"::time
    ) AT TIME ZONE 'UTC'
  ) AT TIME ZONE rule."timeZone",
  'HH24:MI'
)
FROM "legacyRuleTimes" AS legacy
WHERE rule."id" = legacy."id";

-- Build the canonical occurrence identity for sessions backfilled by the
-- previous migration. A same-day time move and a daylight-saving correction
-- can both make scheduledFor differ from this identity.
CREATE TEMP TABLE "_legacy_session_occurrence_repair" ON COMMIT DROP AS
WITH "legacySessions" AS (
  SELECT
    session."id" AS "sessionId",
    session."recurrenceRuleId" AS "ruleId",
    (
      (session."scheduledFor" AT TIME ZONE 'UTC')
      AT TIME ZONE rule."timeZone"
    )::date AS "localDate",
    (
      rule."startsOn"
      + (
        (
          rule."dayOfWeek"
          - EXTRACT(DOW FROM rule."startsOn")::integer
          + 7
        ) % 7
      )
    )::date AS "firstOccurrenceDate",
    rule."endsOn"::date AS "endsOn",
    rule."intervalWeeks",
    rule."startTime",
    rule."timeZone"
  FROM "Session" AS session
  JOIN "RecurrenceRule" AS rule
    ON rule."id" = session."recurrenceRuleId"
  CROSS JOIN "_legacy_recurrence_migration" AS migration
  WHERE session."createdAt" < migration."startedAt"
    AND rule."updatedAt" < migration."startedAt"
    AND session."recurrenceOccurrenceFor" = session."scheduledFor"
)
SELECT
  legacy."sessionId",
  legacy."ruleId",
  legacy."localDate",
  legacy."firstOccurrenceDate",
  legacy."endsOn",
  legacy."intervalWeeks",
  (
    (
      legacy."localDate" + legacy."startTime"::time
    ) AT TIME ZONE legacy."timeZone"
  ) AT TIME ZONE 'UTC' AS "canonicalOccurrenceFor"
FROM "legacySessions" AS legacy;

-- A move to a date outside the rule's cadence cannot be mapped back to its
-- original occurrence because the old schema discarded that information.
-- Fail closed so an operator can set recurrenceOccurrenceFor explicitly
-- instead of allowing the materializer to create a duplicate.
DO $$
DECLARE
  "ambiguousCount" integer;
BEGIN
  SELECT COUNT(*)
  INTO "ambiguousCount"
  FROM "_legacy_session_occurrence_repair"
  WHERE "localDate" < "firstOccurrenceDate"
    OR ("endsOn" IS NOT NULL AND "localDate" > "endsOn")
    OR (
      ("localDate" - "firstOccurrenceDate")
      % ("intervalWeeks" * 7)
    ) <> 0;

  IF "ambiguousCount" > 0 THEN
    RAISE EXCEPTION
      'Found % legacy recurring session(s) moved outside their rule cadence. Set recurrenceOccurrenceFor to each original occurrence before retrying this migration.',
      "ambiguousCount";
  END IF;
END
$$;

-- Do not allow two legacy sessions to collapse onto the same occurrence.
DO $$
DECLARE
  "collisionCount" integer;
BEGIN
  SELECT COUNT(*)
  INTO "collisionCount"
  FROM (
    SELECT "ruleId", "canonicalOccurrenceFor"
    FROM "_legacy_session_occurrence_repair"
    GROUP BY "ruleId", "canonicalOccurrenceFor"
    HAVING COUNT(*) > 1
  ) AS collisions;

  IF "collisionCount" > 0 THEN
    RAISE EXCEPTION
      'Found % duplicate legacy recurrence occurrence(s). Reconcile the affected sessions before retrying this migration.',
      "collisionCount";
  END IF;
END
$$;

UPDATE "Session" AS session
SET "recurrenceOccurrenceFor" = repair."canonicalOccurrenceFor"
FROM "_legacy_session_occurrence_repair" AS repair
WHERE session."id" = repair."sessionId";

-- Terminal enrollments need a durable billing cutoff. For legacy rows, the
-- latest update is the best available record of when the status changed.
UPDATE "Enrollment"
SET "endDate" = "updatedAt"::date
WHERE "status" IN ('COMPLETED', 'CANCELLED')
  AND "endDate" IS NULL;

ALTER TABLE "Enrollment"
ADD CONSTRAINT "Enrollment_terminal_end_date_check"
CHECK (
  "status" NOT IN ('COMPLETED', 'CANCELLED')
  OR "endDate" IS NOT NULL
);

COMMIT;
