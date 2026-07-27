import OpenAI from "openai";
import { ASSISTANT_MODEL } from "@/lib/services/assistant/orchestrator";
import { getAssistantOpenAITools } from "@/lib/services/assistant/tools";

const cases = [
  {
    prompt: "Find the student named Maya and show her guardians.",
    expectedNamespace: "students",
  },
  {
    prompt: "Who is the youngest student?",
    expectedNamespace: "students",
    expectedTool: "query_student_directory",
  },
  {
    prompt:
      "Create student Maya Thompson, born 2012-04-08, with no guardian yet.",
    expectedNamespace: "students",
  },
  {
    prompt:
      "Enroll student ID student_123 into package package_123 with tutor tutor_123 and subject subject_123 starting 2026-08-01.",
    expectedNamespace: "enrollments",
  },
  {
    prompt: "Show overdue payments.",
    expectedNamespace: "billing",
  },
  {
    prompt: "Schedule a recurring lesson for an existing enrollment.",
    expectedNamespace: "recurrence",
  },
  {
    prompt:
      "Mark student ID student_123 present and billable for session session_123.",
    expectedNamespace: "schedule",
  },
  {
    prompt:
      "Record a $120 card payment today for student ID student_123.",
    expectedNamespace: "billing",
  },
  {
    prompt: "Send a payment reminder for an enrollment.",
    expectedNamespace: "billing",
  },
  {
    prompt: "Invite a new staff member.",
    expectedNamespace: "team",
  },
] as const;

async function main() {
  if (!process.env.OPENAI_API_KEY) {
    throw new Error("Set OPENAI_API_KEY before running assistant evaluations");
  }

  const client = new OpenAI();
  const tools = getAssistantOpenAITools("OWNER");
  let failed = 0;

  for (const item of cases) {
    const response = await client.responses.create({
      model: ASSISTANT_MODEL,
      instructions:
        "You are evaluating tool routing. Search for and call the first CRM tool needed to begin the request. Do not invent IDs.",
      input: item.prompt,
      tools,
      tool_choice: "required",
      parallel_tool_calls: false,
      reasoning: { effort: "low", context: "current_turn" },
      max_output_tokens: 600,
      store: false,
    });
    const call = response.output.find(
      (output) => output.type === "function_call",
    );
    const passed =
      call?.namespace === item.expectedNamespace &&
      (!("expectedTool" in item) || call?.name === item.expectedTool);
    if (!passed) failed += 1;
    console.log(
      JSON.stringify({
        prompt: item.prompt,
        expectedNamespace: item.expectedNamespace,
        expectedTool: "expectedTool" in item ? item.expectedTool : null,
        actualNamespace: call?.namespace ?? null,
        actualTool: call?.name ?? null,
        passed,
      }),
    );
  }

  if (failed > 0) process.exitCode = 1;
}

void main();
