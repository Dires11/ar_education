export type AssistantClientToolStatus =
  | "COMPLETED"
  | "FAILED"
  | "REJECTED";

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
    "ok" in result &&
    result.ok === false
  ) {
    return "FAILED";
  }
  return "COMPLETED";
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
    const event = JSON.parse(data) as Event;
    if (TERMINAL_EVENT_TYPES.has(event.type)) terminalEventSeen = true;
    onEvent(event);
  };

  while (true) {
    const { done, value } = await reader.read();
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
    throw new Error(
      "The assistant connection closed before the request finished. Reload to reconcile its status before retrying.",
    );
  }
}
