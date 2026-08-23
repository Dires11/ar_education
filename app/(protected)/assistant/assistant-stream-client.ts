export type AssistantClientToolStatus =
  | "COMPLETED"
  | "FAILED"
  | "REJECTED"
  | "UNKNOWN";

export class IncompleteAssistantStreamError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = "IncompleteAssistantStreamError";
  }
}

const TERMINAL_EVENT_TYPES = new Set([
  "assistant_completed",
  "confirmation_required",
  "error",
]);

export function getToolCompletionStatus(
  result: unknown,
): AssistantClientToolStatus {
  if (
    result &&
    typeof result === "object" &&
    "status" in result &&
    result.status === "rejected_by_user"
  ) {
    return "REJECTED";
  }
  if (
    result &&
    typeof result === "object" &&
    "status" in result &&
    result.status === "outcome_unknown"
  ) {
    return "UNKNOWN";
  }
  if (
    result &&
    typeof result === "object" &&
    "ok" in result &&
    result.ok === false
  ) {
    return "FAILED";
  }
  return "COMPLETED";
}

export function isAssistantOutcomeUnknown(error: unknown) {
  if (error instanceof IncompleteAssistantStreamError) return true;
  const message = error instanceof Error ? error.message : String(error);
  return (
    message.includes("may have completed") ||
    message.includes("outcome is unknown") ||
    message.includes("CRM operations completed") ||
    message.includes("avoid a duplicate")
  );
}

export function isVisibleConfirmationArgument(key: string) {
  return !key.startsWith("__") && !/(?:^id$|Id$|Ids$)/.test(key);
}

export async function consumeAssistantEventStream<
  Event extends { type: string },
>(response: Response, onEvent: (event: Event) => void) {
  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as {
      error?: string;
    } | null;
    throw new Error(body?.error ?? "Assistant request failed");
  }
  if (!response.body) throw new Error("Assistant stream was unavailable");

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let terminalEventSeen = false;

  const consumeFrame = (frame: string) => {
    const data = frame
      .split(/\r?\n/)
      .filter((line) => line.startsWith("data:"))
      .map((line) => line.slice(5).trimStart())
      .join("\n");
    if (!data) return;
    let event: Event;
    try {
      event = JSON.parse(data) as Event;
    } catch (error) {
      throw new IncompleteAssistantStreamError(
        "The assistant stream became unreadable, so its outcome is unknown. Reload to reconcile its status before retrying.",
        { cause: error },
      );
    }
    if (TERMINAL_EVENT_TYPES.has(event.type)) terminalEventSeen = true;
    onEvent(event);
  };

  while (true) {
    let chunk: ReadableStreamReadResult<Uint8Array>;
    try {
      chunk = await reader.read();
    } catch (error) {
      throw new IncompleteAssistantStreamError(
        "The assistant connection failed before completion, so its outcome is unknown. Reload to reconcile its status before retrying.",
        { cause: error },
      );
    }
    const { done, value } = chunk;
    buffer += decoder.decode(value, { stream: !done });
    const frames = buffer.split(/\r?\n\r?\n/);
    buffer = frames.pop() ?? "";
    for (const frame of frames) consumeFrame(frame);
    if (done) {
      if (buffer.trim()) consumeFrame(buffer);
      break;
    }
  }

  if (!terminalEventSeen) {
    throw new IncompleteAssistantStreamError(
      "The assistant connection closed before the request finished, so its outcome is unknown. Reload to reconcile its status before retrying.",
    );
  }
}
