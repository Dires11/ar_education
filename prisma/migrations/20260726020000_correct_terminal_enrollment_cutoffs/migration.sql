-- The reconciliation migration backfilled terminal Enrollment.endDate from a
-- UTC timestamp cast. Enrollment end dates are center-local calendar dates, so
-- a status change during the final Pacific hours of a day could be assigned to
-- the following billing day/month.
--
-- Only rows that still exactly match the prior backfill and differ from the
-- center-local date are changed. Explicit end dates that do not match that
-- signature are left untouched.
UPDATE "Enrollment"
SET "endDate" = (
  (
    "updatedAt" AT TIME ZONE 'UTC'
  ) AT TIME ZONE 'America/Los_Angeles'
)::date
WHERE "status" IN ('COMPLETED', 'CANCELLED')
  AND "endDate" = "updatedAt"::date
  AND "endDate" <> (
    (
      "updatedAt" AT TIME ZONE 'UTC'
    ) AT TIME ZONE 'America/Los_Angeles'
  )::date;
