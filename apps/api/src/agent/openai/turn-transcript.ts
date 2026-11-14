import type OpenAI from "openai";
import type { StreamedFunctionCall } from "./responses.stream.js";
import { compactToolOutput } from "../utils/compact-tool-output.js";

export type TurnInputItem = OpenAI.Responses.ResponseInputItem;

/**
 * Builds a cumulative Responses `input` array for providers that do not support
 * `previous_response_id` (e.g. OpenRouter). Each request is independent, so the
 * full user → function_call → function_call_output history must be resent.
 */
export class TurnTranscript {
  private readonly items: TurnInputItem[] = [];

  constructor(initialUserText: string) {
    this.items.push({
      role: "user",
      content: initialUserText,
    });
  }

  snapshot(): TurnInputItem[] {
    return [...this.items];
  }

  /** Append model function calls so the next independent request can see them. */
  appendFunctionCalls(
    calls: Array<Pick<StreamedFunctionCall, "callId" | "name" | "arguments">>,
  ): void {
    for (const call of calls) {
      this.items.push({
        type: "function_call",
        call_id: call.callId,
        name: call.name,
        arguments: call.arguments,
      });
    }
  }

  appendFunctionOutputs(
    outputs: Array<{ callId: string; output: unknown }>,
  ): void {
    for (const item of outputs) {
      this.items.push({
        type: "function_call_output",
        call_id: item.callId,
        output: compactToolOutput(item.output),
      });
    }
  }

  appendUserMessage(content: string): void {
    this.items.push({
      role: "user",
      content,
    });
  }
}
