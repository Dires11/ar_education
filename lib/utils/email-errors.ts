export class ExternalMutationOutcomeUnknownError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = "ExternalMutationOutcomeUnknownError";
  }
}

export class DeliveryOutcomeUnknownError extends ExternalMutationOutcomeUnknownError {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = "DeliveryOutcomeUnknownError";
  }
}

export function isAmbiguousExternalMutationError(error: unknown) {
  if (error instanceof TypeError) return true;
  if (!error || typeof error !== "object") return false;
  const record = error as Record<string, unknown>;
  const status =
    typeof record.status === "number"
      ? record.status
      : typeof record.statusCode === "number"
        ? record.statusCode
        : undefined;
  if (status !== undefined) return status >= 500;
  const code = typeof record.code === "string" ? record.code : "";
  if (/^(ECONNRESET|ECONNABORTED|ETIMEDOUT|EPIPE|UND_ERR_)/.test(code)) {
    return true;
  }
  const message = error instanceof Error ? error.message : "";
  return /timed?\s*out|network|fetch failed|socket|connection reset/i.test(
    message,
  );
}
