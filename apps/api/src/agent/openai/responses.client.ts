import type OpenAI from "openai";
import type { Response as OpenAIResponse } from "openai/resources/responses/responses.js";
import type { Env } from "../../config/env.js";
import { hasOpenAiKey } from "../../config/env.js";
import { getOpenAiClient } from "../../openai/openai.client.js";
import { buildResponsesCreateArgs } from "../../openai/responses-params.js";
import type { AgentConfig } from "../agent.config.js";
import {
  agentConfigurationError,
  agentIncompleteError,
  agentProviderError,
  agentTimeoutError,
} from "../errors/agent.errors.js";
import { sanitizeSecret } from "../../search/search.utils.js";

export type ResponsesCreateInput = {
  model: string;
  input: OpenAI.Responses.ResponseInput;
  previousResponseId?: string | null;
  toolChoice?: "auto" | "none";
  maxOutputTokens: number;
};

export interface ResponsesClient {
  create(input: ResponsesCreateInput): Promise<OpenAIResponse>;
}

export class OpenAiResponsesClient implements ResponsesClient {
  private readonly client: OpenAI;

  constructor(
    private readonly env: Env,
    private readonly config: AgentConfig,
  ) {
    if (!hasOpenAiKey(env)) {
      throw agentConfigurationError();
    }
    this.client = getOpenAiClient(env);
  }

  async create(input: ResponsesCreateInput): Promise<OpenAIResponse> {
    try {
      const response = (await this.client.responses.create(
        buildResponsesCreateArgs(this.env, this.config, input) as never,
      )) as OpenAIResponse;

      if (response.status === "failed") {
        throw agentProviderError(
          sanitizeSecret(response.error?.message ?? "OpenAI response failed"),
        );
      }
      if (response.status === "incomplete") {
        throw agentIncompleteError(
          sanitizeSecret(
            response.incomplete_details?.reason ?? "OpenAI response incomplete",
          ),
        );
      }

      return response;
    } catch (error) {
      if (
        error &&
        typeof error === "object" &&
        "code" in error &&
        typeof (error as { code: unknown }).code === "string" &&
        String((error as { code: string }).code).startsWith("AGENT_")
      ) {
        throw error;
      }
      if (isTimeout(error)) {
        throw agentTimeoutError();
      }
      throw agentProviderError(
        sanitizeSecret(error instanceof Error ? error.message : "OpenAI error"),
      );
    }
  }
}

function isTimeout(error: unknown): boolean {
  if (!error || typeof error !== "object") {
    return false;
  }
  const code =
    "code" in error && typeof error.code === "string" ? error.code : "";
  const message = error instanceof Error ? error.message.toLowerCase() : "";
  return (
    code === "ETIMEDOUT" ||
    code === "ECONNABORTED" ||
    message.includes("timeout")
  );
}
