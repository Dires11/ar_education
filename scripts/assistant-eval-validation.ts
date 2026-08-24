import type { AssistantToolSpec } from "@/lib/services/assistant/tools";

export type AssistantEvalArgumentValidation =
  | {
      success: true;
      arguments: Record<string, unknown>;
    }
  | {
      success: false;
      arguments: Record<string, unknown>;
      error: string;
    };

export function validateAssistantEvalArguments(
  spec: AssistantToolSpec,
  serializedArguments: string,
): AssistantEvalArgumentValidation {
  let parsed: unknown;
  try {
    parsed = JSON.parse(serializedArguments) as unknown;
  } catch {
    return {
      success: false,
      arguments: {},
      error: "Tool arguments were not valid JSON",
    };
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    return {
      success: false,
      arguments: {},
      error: "Tool arguments were not an object",
    };
  }

  const result = spec.schema.safeParse(parsed);
  if (!result.success) {
    return {
      success: false,
      arguments: parsed as Record<string, unknown>,
      error: result.error.issues.map((issue) => issue.message).join("; "),
    };
  }
  if (
    !result.data ||
    typeof result.data !== "object" ||
    Array.isArray(result.data)
  ) {
    return {
      success: false,
      arguments: parsed as Record<string, unknown>,
      error: "Validated tool arguments were not an object",
    };
  }
  return {
    success: true,
    arguments: result.data as Record<string, unknown>,
  };
}
