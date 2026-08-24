import { z } from "zod";
import { requireAdmin } from "@/lib/utils/auth";
import { getAssistantHistoryPage } from "@/lib/services/assistant/orchestrator";
import { assistantHistoryQuerySchema } from "@/lib/validators/assistant";

export async function GET(request: Request) {
  try {
    const admin = await requireAdmin();
    const query = assistantHistoryQuerySchema.parse(
      Object.fromEntries(new URL(request.url).searchParams),
    );
    return Response.json(await getAssistantHistoryPage(admin, query));
  } catch (error) {
    if (error instanceof z.ZodError) {
      return Response.json(
        { error: "Invalid assistant history request", issues: error.issues },
        { status: 400 },
      );
    }
    const message =
      error instanceof Error ? error.message : "Assistant history failed";
    const status =
      message === "Unauthorized" ? 401 : message === "Forbidden" ? 403 : 500;
    return Response.json({ error: message }, { status });
  }
}
