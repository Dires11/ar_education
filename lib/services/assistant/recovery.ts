import {
  assistantToolMutatesData,
  getAssistantToolSpec,
} from "@/lib/services/assistant/tools";

type RecoveryToolRun = {
  namespace: string;
  toolName: string;
  status: string;
};

export function classifyFailedAssistantRun(
  toolRuns: RecoveryToolRun[],
  role: "OWNER" | "STAFF",
) {
  const mutationRuns = toolRuns.filter((tool) => {
    const spec = getAssistantToolSpec(tool.namespace, tool.toolName, role);
    // Removed or unknown tools are treated conservatively as mutations.
    return !spec || assistantToolMutatesData(spec);
  });
  return {
    outcomeUnknown: mutationRuns.some((tool) =>
      ["RUNNING", "UNKNOWN"].includes(tool.status),
    ),
    // A new turn is safe only if the failed run never attempted a write.
    // Completed reads can be repeated; mutation failures require inspection or
    // an explicitly revised request rather than a one-click replay.
    retryable: mutationRuns.length === 0,
  };
}
