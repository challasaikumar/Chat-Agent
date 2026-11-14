import type { AgentConfig } from "../agent/agent.config.js";
import {
  finalAnswerJsonSchema,
  webSearchToolDefinition,
} from "../agent/agent.schemas.js";
import { AGENT_INSTRUCTIONS } from "../agent/agent.instructions.js";
import type { Env } from "../config/env.js";
import { resolveLlmProvider } from "../config/env.js";
import type { ResponsesCreateInput } from "../agent/openai/responses.client.js";

/**
 * Build Responses API create args that work on OpenAI and OpenRouter free models.
 * Free / OpenRouter paths disable `store` and optional strict json_schema when unsupported.
 */
export function buildResponsesCreateArgs(
  env: Env,
  config: AgentConfig,
  input: ResponsesCreateInput,
  options: { stream?: boolean } = {},
) {
  const provider = resolveLlmProvider(env);
  const args: Record<string, unknown> = {
    model: input.model || provider.model,
    instructions: AGENT_INSTRUCTIONS,
    input: input.input,
    tools: [webSearchToolDefinition],
    tool_choice: input.toolChoice ?? "auto",
    parallel_tool_calls: false,
    max_output_tokens: input.maxOutputTokens,
    // OpenAI-only persistence; OpenRouter and most free gateways reject `store: true`.
    store: provider.supportsStore,
  };

  // OpenRouter: "previous_response_id is not supported on this proxy"
  if (
    provider.supportsPreviousResponseId &&
    input.previousResponseId
  ) {
    args.previous_response_id = input.previousResponseId;
  }

  if (options.stream) {
    args.stream = true;
  }

  if (provider.supportsStructuredOutput) {
    args.text = {
      format: {
        type: "json_schema",
        name: "agent_final_answer",
        strict: true,
        schema: finalAnswerJsonSchema,
      },
    };
  }

  return args;
}
