/**
 * One-time cleanup: delete RecurrenceRule rows where endsOn < startsOn.
 * These are garbage rows created by the cascading-split bug (now fixed).
 * Also deletes Session rows linked to those invalid rules.
 *
 * Run: npx tsx scripts/cleanup-invalid-rules.ts
 */

import { config } from "dotenv";
config({ path: ".env" });

import { PrismaClient } from "../generated/prisma";
import { PrismaNeon } from "@prisma/adapter-neon";

const adapter = new PrismaNeon({ connectionString: process.env.DATABASE_URL! });
const prisma = new PrismaClient({ adapter });

async function main() {
  // Find all invalid rules
  const allRules = await prisma.recurrenceRule.findMany({
    select: { id: true, startsOn: true, endsOn: true, enrollmentId: true, dayOfWeek: true },
  });

  const invalidRuleIds = allRules
    .filter((r) => r.endsOn !== null && r.endsOn < r.startsOn)
    .map((r) => r.id);

  console.log(`Found ${invalidRuleIds.length} invalid recurrence rule(s) to delete.`);

  if (invalidRuleIds.length === 0) {
    console.log("Nothing to clean up.");
    return;
  }

  // Delete sessions linked to invalid rules first
  const sessionResult = await prisma.session.deleteMany({
    where: { recurrenceRuleId: { in: invalidRuleIds } },
  });
  console.log(`Deleted ${sessionResult.count} session(s) linked to invalid rules.`);

  // Delete the invalid rules
  const ruleResult = await prisma.recurrenceRule.deleteMany({
    where: { id: { in: invalidRuleIds } },
  });
  console.log(`Deleted ${ruleResult.count} invalid recurrence rule(s).`);

  console.log("Cleanup complete.");
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
