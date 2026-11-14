import type { Response as OpenAIResponse } from "openai/resources/responses/responses.js";
import type {
  ResponsesClient,
  ResponsesCreateInput,
} from "../../apps/api/src/agent/openai/responses.client.ts";

let seq = 0;

function baseResponse(
  overrides: Partial<OpenAIResponse> & {
    output: OpenAIResponse["output"];
  },
): OpenAIResponse {
  seq += 1;
  return {
    id: `resp_${seq}`,
    object: "response",
    created_at: Date.now() / 1000,
    status: "completed",
    error: null,
    incomplete_details: null,
    instructions: null,
    max_output_tokens: null,
    model: "test-model",
    output: overrides.output,
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
      input_tokens: 10,
      output_tokens: 20,
      total_tokens: 30,
      input_tokens_details: { cached_tokens: 0 },
      output_tokens_details: { reasoning_tokens: 0 },
    },
    user: null,
    metadata: {},
    ...overrides,
  } as OpenAIResponse;
}

export function finalAnswerResponse(answer: string, citations: string[] = []): OpenAIResponse {
  const payload = JSON.stringify({ answer, citations });
  return baseResponse({
    output_text: payload,
    output: [
      {
        type: "message",
        id: `msg_${seq}`,
        status: "completed",
        role: "assistant",
        content: [{ type: "output_text", text: payload, annotations: [] }],
      } as OpenAIResponse["output"][number],
    ],
  });
}

export function functionCallResponse(
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

export function scriptedResponsesClient(
  script: Array<(input: ResponsesCreateInput) => OpenAIResponse>,
): ResponsesClient {
  let index = 0;
  return {
    async create(input) {
      const step = script[index];
      if (!step) {
        throw new Error(`No scripted response for step ${index}`);
      }
      index += 1;
      return step(input);
    },
  };
}
