import type {
  Response as OpenAIResponse,
  ResponseFunctionToolCall,
  ResponseOutputItem,
} from "openai/resources/responses/responses.js";
import { finalAnswerSchema, type FinalAnswer } from "../agent.schemas.js";
import { agentIncompleteError, agentProviderError } from "../errors/agent.errors.js";

export function extractFunctionCalls(
  response: OpenAIResponse,
): ResponseFunctionToolCall[] {
  return response.output.filter(
    (item): item is ResponseFunctionToolCall => item.type === "function_call",
  );
}

export function extractOutputText(response: OpenAIResponse): string {
  if (response.output_text?.trim()) {
    return response.output_text;
  }

  const chunks: string[] = [];
  for (const item of response.output) {
    if (item.type !== "message") {
      continue;
    }
    for (const part of item.content) {
      if (part.type === "output_text") {
        chunks.push(part.text);
      }
    }
  }
  return chunks.join("\n").trim();
}

export function parseFinalAnswer(response: OpenAIResponse): FinalAnswer {
  const text = extractOutputText(response);
  if (!text) {
    throw agentIncompleteError("Model returned no final answer text");
  }

  const candidate = unwrapJsonCandidate(text);
  let parsed: unknown;
  try {
    parsed = JSON.parse(candidate);
  } catch (error) {
    // Free / OpenRouter models often return prose instead of strict JSON.
    const prose = text
      .replace(/^```(?:json)?\s*/i, "")
      .replace(/\s*```$/i, "")
      .trim();
    if (prose && !prose.startsWith("{")) {
      return { answer: prose, citations: [] };
    }
    throw agentProviderError("Model returned invalid final answer JSON", {
      cause: error instanceof Error ? error.message : "parse error",
    });
  }

  const validated = finalAnswerSchema.safeParse(parsed);
  if (!validated.success) {
    if (typeof (parsed as { answer?: unknown }).answer === "string") {
      return {
        answer: (parsed as { answer: string }).answer,
        citations: [],
      };
    }
    throw agentProviderError("Model final answer failed schema validation", {
      details: validated.error.flatten(),
    });
  }

  return validated.data;
}

function unwrapJsonCandidate(text: string): string {
  const trimmed = text.trim();
  const fenced = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  const body = fenced?.[1]?.trim() || trimmed;
  const start = body.indexOf("{");
  const end = body.lastIndexOf("}");
  if (start >= 0 && end > start) {
    return body.slice(start, end + 1);
  }
  return body;
}

export function summarizeOutputTypes(output: ResponseOutputItem[]): string[] {
  return output.map((item) => item.type);
}

export function accumulateUsage(
  current: { inputTokens: number; outputTokens: number },
  response: OpenAIResponse,
): { inputTokens: number; outputTokens: number } {
  return {
    inputTokens: current.inputTokens + (response.usage?.input_tokens ?? 0),
    outputTokens: current.outputTokens + (response.usage?.output_tokens ?? 0),
  };
}
