import type { Response as OpenAIResponse } from "openai/resources/responses/responses.js";
import type {
  ResponsesClient,
  ResponsesCreateInput,
} from "../../agent/openai/responses.client.js";
import type { EvaluationCase } from "../evaluation.schemas.js";

let seq = 0;

function baseResponse(
  overrides: Partial<OpenAIResponse> & { output: OpenAIResponse["output"] },
): OpenAIResponse {
  seq += 1;
  const { output, ...rest } = overrides;
  return {
    id: `resp_eval_${seq}`,
    object: "response",
    created_at: Date.now() / 1000,
    status: "completed",
    error: null,
    incomplete_details: null,
    instructions: null,
    max_output_tokens: null,
    model: "eval-fixture-model",
    output,
    parallel_tool_calls: false,
    previous_response_id: null,
    reasoning: null,
    store: true,
    temperature: null,
    text: null,
    tool_choice: "auto",
    tools: [],
    top_p: null,
    truncation: null,
    usage: {
      input_tokens: 100,
      output_tokens: 50,
      total_tokens: 150,
      input_tokens_details: { cached_tokens: 10 },
      output_tokens_details: { reasoning_tokens: 0 },
    },
    user: null,
    metadata: {},
    ...rest,
  } as OpenAIResponse;
}

function finalAnswer(answer: string, citations: string[] = []): OpenAIResponse {
  const payload = JSON.stringify({ answer, citations });
  return baseResponse({
    output_text: payload,
    output: [
      {
        type: "message",
        id: `msg_eval_${seq}`,
        status: "completed",
        role: "assistant",
        content: [{ type: "output_text", text: payload, annotations: [] }],
      } as OpenAIResponse["output"][number],
    ],
  });
}

function functionCall(
  callId: string,
  args: Record<string, unknown>,
): OpenAIResponse {
  return baseResponse({
    output_text: "",
    output: [
      {
        type: "function_call",
        call_id: callId,
        name: "web_search",
        arguments: JSON.stringify(args),
      } as OpenAIResponse["output"][number],
    ],
  });
}

function inputText(input: ResponsesCreateInput): string {
  if (typeof input.input === "string") return input.input;
  if (!Array.isArray(input.input)) return JSON.stringify(input.input ?? "");
  return JSON.stringify(input.input);
}

function pickFinalAnswer(
  fixtures: EvaluationCase["openaiFixtures"],
): { answer: string; citations: string[] } {
  const found = [...fixtures].reverse().find((f) => f.finalAnswer)?.finalAnswer;
  return {
    answer:
      found?.answer ??
      "Evaluation fixture default answer. Historical context and evidence were considered.",
    citations: found?.citations ?? [],
  };
}

/**
 * Scripted OpenAI Responses client for deterministic evaluation.
 * Respects toolChoice=none (used after tool budget / temporal comparison injection).
 */
export function createFixtureOpenAiProvider(
  fixtures: EvaluationCase["openaiFixtures"] = [],
): ResponsesClient & {
  callCount: number;
  usageTotals: { input: number; output: number; cached: number };
} {
  let index = 0;
  let callCount = 0;
  let emittedFunctionCall = false;
  const usageTotals = { input: 0, output: 0, cached: 0 };

  return {
    get callCount() {
      return callCount;
    },
    get usageTotals() {
      return { ...usageTotals };
    },
    async create(input: ResponsesCreateInput) {
      callCount += 1;
      usageTotals.input += 100;
      usageTotals.output += 50;
      usageTotals.cached += 10;

      // Orchestrator forces synthesis with toolChoice=none after tools / comparison.
      if (input.toolChoice === "none" || emittedFunctionCall && index >= fixtures.length) {
        const fin = pickFinalAnswer(fixtures);
        return finalAnswer(fin.answer, fin.citations);
      }

      const text = inputText(input);
      const step =
        fixtures[index] ??
        fixtures.find(
          (f) =>
            f.whenInputContains &&
            text.toLowerCase().includes(f.whenInputContains.toLowerCase()),
        );
      index += 1;

      if (step?.functionCalls?.length) {
        emittedFunctionCall = true;
        const call = step.functionCalls[0]!;
        return functionCall(`call_eval_${callCount}`, {
          searchDepth: "basic",
          maxResults: 5,
          ...call.arguments,
        });
      }

      if (step?.finalAnswer) {
        return finalAnswer(step.finalAnswer.answer, step.finalAnswer.citations);
      }

      const fin = pickFinalAnswer(fixtures);
      return finalAnswer(fin.answer, fin.citations);
    },
  };
}
