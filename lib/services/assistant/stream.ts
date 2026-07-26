import "server-only";

import type { Admin } from "@/generated/prisma";
import type {
  AssistantDecisionInput,
  AssistantTurnInput,
} from "@/lib/validators/assistant";
import {
  processAssistantDecision,
  processAssistantTurn,
  type AssistantStreamEvent,
} from "@/lib/services/assistant/orchestrator";

type AdminContext = Pick<Admin, "id" | "role">;

function createEventResponse(
  task: (emit: (event: AssistantStreamEvent) => void) => Promise<void>,
) {
  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const emit = (event: AssistantStreamEvent) => {
        controller.enqueue(
          encoder.encode(`data: ${JSON.stringify(event)}\n\n`),
        );
      };
      try {
        await task(emit);
      } catch (error) {
        emit({
          type: "error",
          message:
            error instanceof Error ? error.message : "Assistant request failed",
        });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}

export function streamAssistantTurn(
  admin: AdminContext,
  turn: AssistantTurnInput,
) {
  return createEventResponse((emit) => processAssistantTurn(admin, turn, emit));
}

export function streamAssistantDecision(
  admin: AdminContext,
  toolRunId: string,
  decision: AssistantDecisionInput["decision"],
) {
  return createEventResponse((emit) =>
    processAssistantDecision(admin, toolRunId, decision, emit),
  );
}
