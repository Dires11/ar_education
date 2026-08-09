import "dotenv/config";
import OpenAI from "openai";
import { ASSISTANT_MODEL } from "@/lib/services/assistant/config";
import { ASSISTANT_ROUTING_EVAL_CASES } from "@/lib/services/assistant/evals";
import { getAssistantOpenAITools } from "@/lib/services/assistant/tools";

async function main() {
  if (!process.env.OPENAI_API_KEY) {
    throw new Error("Set OPENAI_API_KEY before running assistant evaluations");
  }

  const client = new OpenAI();
  const tools = getAssistantOpenAITools("OWNER");
  const results = await Promise.all(
    ASSISTANT_ROUTING_EVAL_CASES.map(async (item) => {
      const response = await client.responses.create({
        model: ASSISTANT_MODEL,
        instructions:
          "You are evaluating tool routing. Search for and call the exact first CRM tool needed to perform the request. Do not invent IDs. When an explicit write already includes every required field and a known target ID, call that write directly rather than inspecting history first.",
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
        call?.name === item.expectedTool;
      return {
        name: item.name,
        prompt: item.prompt,
        expectedNamespace: item.expectedNamespace,
        expectedTool: item.expectedTool,
        actualNamespace: call?.namespace ?? null,
        actualTool: call?.name ?? null,
        passed,
      };
    }),
  );

  for (const result of results) {
    console.log(JSON.stringify(result));
  }

  if (results.some((result) => !result.passed)) process.exitCode = 1;
}

void main();
