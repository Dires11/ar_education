import { config } from "dotenv";
config({ path: ".env" });

import { addDays } from "date-fns";
import { materializeSessions } from "../lib/services/sessions";

const now = new Date();
const to = addDays(now, 30);

console.log(`Materializing sessions from ${now.toISOString().slice(0, 10)} → ${to.toISOString().slice(0, 10)} ...`);

materializeSessions(now, to)
  .then((count) => {
    console.log(`Done. Created ${count} session(s).`);
    process.exit(0);
  })
  .catch((err) => {
    console.error("Error:", err);
    process.exit(1);
  });
