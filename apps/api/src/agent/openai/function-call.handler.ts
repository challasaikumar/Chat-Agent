import type { ResponseFunctionToolCall } from "openai/resources/responses/responses.js";
import type { ToolExecutor } from "../tools/tool-executor.js";
import type { ToolExecutionContext } from "../tools/tool.interface.js";
import { agentToolError } from "../errors/agent.errors.js";

export type HandledFunctionCall = {
  callId: string;
  name: string;
  output: Record<string, unknown>;
  searchExecuted: boolean;
  toolCallRecordId: string;
};

export class FunctionCallHandler {
  constructor(private readonly executor: ToolExecutor) {}

  async handleAll(
    calls: ResponseFunctionToolCall[],
    context: ToolExecutionContext & { conversationId: string },
  ): Promise<HandledFunctionCall[]> {
    const handled: HandledFunctionCall[] = [];

    for (const call of calls) {
      if (call.type !== "function_call") {
        continue;
      }
      if (!call.call_id) {
        throw agentToolError("Function call missing call_id");
      }
      if (call.name !== "web_search") {
        throw agentToolError(`Unknown function: ${call.name}`);
      }

      const result = await this.executor.executeFunctionCall({
        conversationId: context.conversationId,
        callId: call.call_id,
        name: call.name,
        argumentsJson: call.arguments,
        context,
      });

      handled.push({
        callId: call.call_id,
        name: call.name,
        output: result.output,
        searchExecuted: result.searchExecuted,
        toolCallRecordId: result.toolCallRecordId,
      });
    }

    return handled;
  }
}
