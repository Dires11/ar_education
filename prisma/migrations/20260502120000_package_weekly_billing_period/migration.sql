CREATE TYPE "BillingPeriod" AS ENUM ('MONTHLY', 'THREE_MONTHS', 'YEARLY');

ALTER TABLE "Package" ADD COLUMN "billingPeriod" "BillingPeriod" NOT NULL DEFAULT 'MONTHLY';
ALTER TABLE "Package" RENAME COLUMN "sessionsPerMonth" TO "sessionsPerWeek";
