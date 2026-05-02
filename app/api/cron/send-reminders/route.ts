import { NextRequest, NextResponse } from "next/server";
import { addDays } from "date-fns";
import { processDueReminders } from "@/lib/services/notifications";
import { materializeSessions } from "@/lib/services/sessions";

export async function GET(request: NextRequest) {
  const authHeader = request.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;

  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const now = new Date();
    // Materialize first so newly created sessions can receive reminders
    const materialized = await materializeSessions(now, addDays(now, 30));
    const reminders = await processDueReminders();

    return NextResponse.json({ ok: true, materialized, ...reminders });
  } catch (error) {
    console.error("[cron/send-reminders]", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
