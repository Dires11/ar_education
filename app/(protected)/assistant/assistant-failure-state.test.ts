import { describe, expect, it } from "vitest";
import {
  failedTurnFromMessage,
  persistedFailedTurn,
} from "./assistant-failure-state";

const unknownFailure = {
  clientTurnId: "turn-1",
  error: "The outbound operation outcome is unknown.",
  hasAttachments: false,
  outcomeUnknown: true,
  retryable: false,
  reuseClientTurnId: false,
};

describe("assistant failure display state", () => {
  it("keeps an older failure displayable after a later successful turn", () => {
    const olderFailure = {
      id: "message-1",
      role: "USER" as const,
      content: "Send the email",
      failure: unknownFailure,
    };
    const messages = [
      olderFailure,
      {
        id: "message-2",
        role: "ASSISTANT" as const,
        content: "The outcome is unknown.",
        failure: null,
      },
      {
        id: "message-3",
        role: "USER" as const,
        content: "Show today's schedule",
        failure: null,
      },
    ];

    expect(persistedFailedTurn(messages)).toBeNull();
    expect(failedTurnFromMessage(olderFailure)).toMatchObject({
      optimisticId: "message-1",
      outcomeUnknown: true,
      retryable: false,
    });
  });

  it("only exposes retry controls for the latest failed user turn", () => {
    const failure = {
      id: "message-1",
      role: "USER" as const,
      content: "Find Maya",
      failure: { ...unknownFailure, outcomeUnknown: false, retryable: true },
    };

    expect(persistedFailedTurn([failure])).toMatchObject({
      optimisticId: "message-1",
      retryable: true,
    });
  });
});
