import { z } from "zod";
import { requireAdmin } from "@/lib/utils/auth";
import { assistantDecisionSchema } from "@/lib/validators/assistant";
import { streamAssistantDecision } from "@/lib/services/assistant/stream";

export const maxDuration = 300;

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const admin = await requireAdmin();
    const { id } = await context.params;
    const input = assistantDecisionSchema.parse(await request.json());
    return streamAssistantDecision(admin, id, input.decision, request.signal);
  } catch (error) {
    if (error instanceof SyntaxError) {
      return Response.json(
        { error: "Invalid confirmation decision: malformed JSON" },
        { status: 400 },
      );
    }
    if (error instanceof z.ZodError) {
      return Response.json(
        { error: "Invalid confirmation decision", issues: error.issues },
        { status: 400 },
      );
    }
    const message =
      error instanceof Error ? error.message : "Assistant request failed";
    const status =
      message === "Unauthorized"
        ? 401
        : message === "Forbidden"
          ? 403
          : message.includes("not found")
            ? 404
            : 500;
    return Response.json({ error: message }, { status });
  }
}
