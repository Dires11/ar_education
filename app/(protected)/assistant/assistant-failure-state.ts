export type AssistantMessageFailure = {
  clientTurnId: string;
  error: string;
  hasAttachments: boolean;
  outcomeUnknown: boolean;
  retryable: boolean;
  reuseClientTurnId: boolean;
};

export type AssistantFailedTurn<Attachment> = {
  clientTurnId: string;
  optimisticId: string;
  content: string;
  attachments: Attachment[];
  error: string;
  outcomeUnknown: boolean;
  requiresReattachment: boolean;
  retryable: boolean;
  reuseClientTurnId: boolean;
  editing: boolean;
};

type FailureMessage = {
  id: string;
  role: "USER" | "ASSISTANT";
  content: string;
  failure: AssistantMessageFailure | null;
};

export function failedTurnFromMessage<Attachment>(
  message: FailureMessage,
): AssistantFailedTurn<Attachment> | null {
  if (message.role !== "USER" || !message.failure) return null;
  return {
    clientTurnId: message.failure.clientTurnId,
    optimisticId: message.id,
    content: message.content,
    attachments: [],
    error: message.failure.error,
    outcomeUnknown: message.failure.outcomeUnknown,
    requiresReattachment:
      message.failure.retryable && message.failure.hasAttachments,
    retryable: message.failure.retryable,
    reuseClientTurnId: message.failure.reuseClientTurnId,
    editing: false,
  };
}

export function persistedFailedTurn<Attachment>(
  messages: FailureMessage[],
): AssistantFailedTurn<Attachment> | null {
  const latestUserMessage = messages.findLast(
    (message) => message.role === "USER",
  );
  return latestUserMessage
    ? failedTurnFromMessage<Attachment>(latestUserMessage)
    : null;
}
