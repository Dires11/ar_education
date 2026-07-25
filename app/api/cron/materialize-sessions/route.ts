import { NextRequest, NextResponse } from "next/server";
import { authorizeCronRequest } from "@/lib/services/cron-authorization";
import { materializeUpcomingSessions } from "@/lib/services/schedule-maintenance";

export async function GET(request: NextRequest) {
  const authorization = authorizeCronRequest(
    request.headers.get("authorization"),
    process.env.CRON_SECRET,
  );

  if (authorization === "MISCONFIGURED") {
    console.error("[cron/materialize-sessions] CRON_SECRET is not configured");
    return NextResponse.json(
      { error: "Scheduled job is not configured" },
      { status: 503 },
    );
  }

  if (authorization === "UNAUTHORIZED") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const materialized = await materializeUpcomingSessions();
    return NextResponse.json({
      ok: true,
      materialized,
      automaticReminders: "disabled",
    });
  } catch (error) {
    console.error("[cron/materialize-sessions]", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
