import "dotenv/config";
import OpenAI from "openai";
import type { ResponseInputItem } from "openai/resources/responses/responses";
import { ASSISTANT_MODEL } from "@/lib/services/assistant/config";
import { ASSISTANT_ROUTING_EVAL_CASES } from "@/lib/services/assistant/evals";
import { getAssistantInstructions } from "@/lib/services/assistant/instructions";
import {
  assistantToolMutatesData,
  assistantToolRequiresConfirmation,
  getAssistantOpenAITools,
  getAssistantToolSpec,
} from "@/lib/services/assistant/tools";

function sanitizeReplayValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sanitizeReplayValue);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .filter(([key]) => key !== "parsed" && key !== "parsed_arguments")
      .map(([key, item]) => [key, sanitizeReplayValue(item)]),
  );
}

function parseArguments(value: string) {
  const parsed = JSON.parse(value) as unknown;
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("Tool arguments were not an object");
  }
  return parsed as Record<string, unknown>;
}

function stringArgument(
  args: Record<string, unknown>,
  key: string,
  fallback: string,
) {
  return typeof args[key] === "string" ? args[key] : fallback;
}

function simulatedLookupResult(
  namespace: string,
  name: string,
  args: Record<string, unknown>,
) {
  const studentId = stringArgument(args, "id", "student_123");
  const tutorId = stringArgument(args, "id", "tutor_123");
  const enrollmentId = stringArgument(args, "id", "enrollment_123");
  if (namespace === "students" && name === "search_students") {
    return {
      ok: true,
      data: {
        total: 1,
        students: [
          { id: "student_123", name: "Maya Thompson", status: "ACTIVE" },
        ],
      },
    };
  }
  if (namespace === "students" && name === "get_student") {
    return {
      ok: true,
      data: {
        id: studentId,
        firstName: "Maya",
        lastName: "Thompson",
        status: "ACTIVE",
      },
    };
  }
  if (namespace === "tutors" && name === "search_tutors") {
    return {
      ok: true,
      data: {
        total: 1,
        tutors: [
          { id: "tutor_123", name: "Theo Grant", status: "ACTIVE" },
        ],
      },
    };
  }
  if (namespace === "tutors" && name === "get_tutor") {
    return {
      ok: true,
      data: { id: tutorId, firstName: "Theo", lastName: "Grant" },
    };
  }
  if (namespace === "catalog" && name === "get_package") {
    return {
      ok: true,
      data: {
        id: stringArgument(args, "id", "package_123"),
        name: "Math Monthly",
        subjectId: "subject_123",
        isActive: true,
      },
    };
  }
  if (namespace === "catalog" && name === "list_subjects") {
    return {
      ok: true,
      data: [{ id: "subject_123", name: "Mathematics" }],
    };
  }
  if (namespace === "enrollments" && name === "get_enrollment") {
    return {
      ok: true,
      data: {
        id: enrollmentId,
        studentId: "student_123",
        tutorId: "tutor_123",
        subjectId: "subject_123",
        packageId: "package_123",
        status: "ACTIVE",
      },
    };
  }
  if (namespace === "schedule" && name === "get_schedule") {
    return {
      ok: true,
      data: {
        id: stringArgument(args, "sessionId", "session_123"),
        studentIds: ["student_123"],
        status: "SCHEDULED",
      },
    };
  }
  if (namespace === "recurrence" && name === "get_recurring_schedule") {
    return {
      ok: true,
      data: { id: stringArgument(args, "ruleId", "rule_123") },
    };
  }
  return { ok: true, data: [] };
}

async function evaluateCase(
  client: OpenAI,
  item: (typeof ASSISTANT_ROUTING_EVAL_CASES)[number],
) {
  const targetKey = `${item.expectedNamespace}.${item.expectedTool}`;
  const transcript: Array<{
    step: number;
    tool: string;
    arguments: Record<string, unknown>;
  }> = [];
  const input: ResponseInputItem[] = [
    { role: "user", content: item.prompt },
  ];
  let failure: string | null = null;

  for (let step = 1; step <= 12 && !failure; step += 1) {
    const response = await client.responses.create({
      model: ASSISTANT_MODEL,
      instructions: getAssistantInstructions("OWNER"),
      input,
      tools: getAssistantOpenAITools("OWNER"),
      parallel_tool_calls: false,
      reasoning: { effort: "medium", context: "current_turn" },
      max_output_tokens: 1_200,
      store: false,
    });
    const calls = response.output.filter(
      (output) => output.type === "function_call",
    );
    if (calls.length === 0) {
      failure = `Model answered before calling ${targetKey}`;
      break;
    }

    input.push(
      ...(sanitizeReplayValue(response.output) as ResponseInputItem[]),
    );
    for (const call of calls) {
      const args = parseArguments(call.arguments);
      const namespace = call.namespace;
      if (!namespace) {
        failure = `Model called ${call.name} without a CRM namespace`;
        break;
      }
      const key = `${namespace}.${call.name}`;
      transcript.push({ step, tool: key, arguments: args });
      const spec = getAssistantToolSpec(namespace, call.name, "OWNER");
      if (!spec) {
        failure = `Model called unavailable tool ${key}`;
        break;
      }
      if (key === targetKey) {
        const calledTools = new Set(
          transcript.slice(0, -1).map((entry) => entry.tool),
        );
        const missingLookups = (item.requiredLookupGroups ?? []).filter(
          (alternatives) =>
            !alternatives.some((lookup) => calledTools.has(lookup)),
        );
        if (missingLookups.length > 0) {
          failure = `Target mutation ran before prerequisite lookup(s): ${missingLookups
            .map((group) => group.join(" or "))
            .join(", ")}`;
          break;
        }
        if (item.expectedConfirmation !== undefined) {
          const actual = assistantToolRequiresConfirmation(spec, args);
          if (actual !== item.expectedConfirmation) {
            failure = `Confirmation classification was ${actual}, expected ${item.expectedConfirmation}`;
          }
        }
        return { ...item, passed: !failure, failure, transcript };
      }
      if (assistantToolMutatesData(spec)) {
        failure = `Unexpected mutation ${key} ran before ${targetKey}`;
        break;
      }
      input.push({
        type: "function_call_output",
        call_id: call.call_id,
        output: JSON.stringify(
          simulatedLookupResult(namespace, call.name, args),
        ),
      });
    }
  }

  return {
    ...item,
    passed: false,
    failure: failure ?? `Exceeded 12 tool calls before ${targetKey}`,
    transcript,
  };
}

async function main() {
  if (!process.env.OPENAI_API_KEY) {
    throw new Error("Set OPENAI_API_KEY before running assistant evaluations");
  }

  const client = new OpenAI();
  const results = await Promise.all(
    ASSISTANT_ROUTING_EVAL_CASES.map((item) => evaluateCase(client, item)),
  );

  for (const result of results) console.log(JSON.stringify(result));
  if (results.some((result) => !result.passed)) process.exitCode = 1;
}

void main();
