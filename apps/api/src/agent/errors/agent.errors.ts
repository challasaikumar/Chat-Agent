export class AgentError extends Error {
  readonly code: string;
  readonly statusCode: number;
  readonly details?: unknown;

  constructor(
    message: string,
    options: {
      code: string;
      statusCode: number;
      details?: unknown;
      cause?: unknown;
    },
  ) {
    super(message, options.cause !== undefined ? { cause: options.cause } : undefined);
    this.name = "AgentError";
    this.code = options.code;
    this.statusCode = options.statusCode;
    this.details = options.details;
  }
}

export function agentConfigurationError(message = "OPENAI_API_KEY is not configured") {
  return new AgentError(message, {
    code: "AGENT_CONFIGURATION_ERROR",
    statusCode: 503,
  });
}

export function agentValidationError(message: string, details?: unknown) {
  return new AgentError(message, {
    code: "AGENT_VALIDATION_ERROR",
    statusCode: 400,
    details,
  });
}

export function agentProviderError(message: string, details?: unknown) {
  return new AgentError(message, {
    code: "AGENT_PROVIDER_ERROR",
    statusCode: 502,
    details,
  });
}

export function agentTimeoutError(message = "Agent request timed out") {
  return new AgentError(message, {
    code: "AGENT_TIMEOUT_ERROR",
    statusCode: 504,
  });
}

export function agentBudgetExhaustedError(message: string) {
  return new AgentError(message, {
    code: "AGENT_BUDGET_EXHAUSTED",
    statusCode: 429,
  });
}

export function agentToolError(message: string, details?: unknown) {
  return new AgentError(message, {
    code: "AGENT_TOOL_ERROR",
    statusCode: 502,
    details,
  });
}

export function agentConflictError(message = "Conversation already has an active agent turn") {
  return new AgentError(message, {
    code: "AGENT_CONFLICT",
    statusCode: 409,
  });
}

export function agentIncompleteError(message = "Model response was incomplete") {
  return new AgentError(message, {
    code: "AGENT_INCOMPLETE_RESPONSE",
    statusCode: 502,
  });
}
