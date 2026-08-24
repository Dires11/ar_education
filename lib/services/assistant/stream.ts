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

export function createAssistantEventResponse(
  task: (
    emit: (event: AssistantStreamEvent) => void,
    signal: AbortSignal,
  ) => Promise<void>,
  requestSignal?: AbortSignal,
) {
  const encoder = new TextEncoder();
  const taskController = new AbortController();
  let closed = false;
  let removeRequestAbortListener: () => void = () => undefined;
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      const emit = (event: AssistantStreamEvent) => {
        if (closed) return;
        try {
          controller.enqueue(
            encoder.encode(`data: ${JSON.stringify(event)}\n\n`),
          );
        } catch {
          closed = true;
        }
      };
      const abortTask = () => {
        if (!closed) {
          closed = true;
          try {
            controller.close();
          } catch {
            // The consumer may have cancelled the stream concurrently.
          }
        }
        taskController.abort(requestSignal?.reason);
      };
      if (requestSignal) {
        if (requestSignal.aborted) abortTask();
        else {
          requestSignal.addEventListener("abort", abortTask, { once: true });
          removeRequestAbortListener = () =>
            requestSignal.removeEventListener("abort", abortTask);
        }
      }
      void task(emit, taskController.signal)
        .catch((error) => {
          emit({
            type: "error",
            message:
              error instanceof Error
                ? error.message
                : "Assistant request failed",
          });
        })
        .finally(() => {
          removeRequestAbortListener();
          if (!closed) {
            closed = true;
            controller.close();
          }
        });
    },
    cancel(reason) {
      closed = true;
      removeRequestAbortListener();
      taskController.abort(reason);
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
  requestSignal?: AbortSignal,
) {
  return createAssistantEventResponse(
    (emit, signal) => processAssistantTurn(admin, turn, emit, signal),
    requestSignal,
  );
}

export function streamAssistantDecision(
  admin: AdminContext,
  toolRunId: string,
  decision: AssistantDecisionInput["decision"],
  requestSignal?: AbortSignal,
) {
  return createAssistantEventResponse(
    (emit, signal) =>
      processAssistantDecision(admin, toolRunId, decision, emit, signal),
    requestSignal,
  );
}
