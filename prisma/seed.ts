import { config } from "dotenv";
config({ path: ".env" });

import { PrismaClient } from "../generated/prisma";
import { PrismaNeon } from "@prisma/adapter-neon";

const adapter = new PrismaNeon({ connectionString: process.env.DATABASE_URL! });
const prisma = new PrismaClient({ adapter });

const DEFAULT_PAYMENT_REMINDER = {
  name: "Payment Reminder",
  type: "PAYMENT_REMINDER" as const,
  subject: "Payment reminder — @subject (@month)",
  body: `Hello @guardian,

This is a friendly reminder that the payment for @name's @subject lessons is due for @month.

Amount due: @amount

Please contact us to arrange payment or if you have any questions.

Thank you,
@center`,
};

async function main() {
  // Only create if no PAYMENT_REMINDER template exists yet
  const existing = await prisma.emailTemplate.findFirst({
    where: { type: "PAYMENT_REMINDER" },
  });

  if (!existing) {
    await prisma.emailTemplate.create({ data: DEFAULT_PAYMENT_REMINDER });
    console.log("✓ Created default Payment Reminder template");
  } else {
    console.log("✓ Payment Reminder template already exists — skipping");
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
