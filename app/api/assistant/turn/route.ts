import { z } from "zod";
import { requireAdmin } from "@/lib/utils/auth";
import { assistantTurnSchema } from "@/lib/validators/assistant";
import { streamAssistantTurn } from "@/lib/services/assistant/stream";

export const maxDuration = 300;

export async function POST(request: Request) {
  try {
    const admin = await requireAdmin();
    const input = assistantTurnSchema.parse(await request.json());
    return streamAssistantTurn(admin, input, request.signal);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return Response.json(
        { error: "Invalid assistant request", issues: error.issues },
        { status: 400 },
      );
    }
    const message =
      error instanceof Error ? error.message : "Assistant request failed";
    const status =
      message === "Unauthorized" ? 401 : message === "Forbidden" ? 403 : 500;
    return Response.json({ error: message }, { status });
  }
}
