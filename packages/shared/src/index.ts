export type ApiSuccessResponse<T> = {
  success: true;
  data: T;
};

export type ApiErrorResponse = {
  success: false;
  error: {
    code: string;
    message: string;
    details?: unknown;
  };
};

export type ApiResponse<T> = ApiSuccessResponse<T> | ApiErrorResponse;

export type HealthStatus = "healthy" | "degraded" | "unhealthy";

export type HealthData = {
  status: HealthStatus;
  service: string;
  timestamp: string;
};

export type DatabaseHealthData = {
  status: HealthStatus;
  connected: boolean;
  databasePath: string;
  timestamp: string;
};

export type ReadyData = {
  status: HealthStatus;
  checks: {
    api: boolean;
    database: boolean;
  };
  timestamp: string;
};

export function ok<T>(data: T): ApiSuccessResponse<T> {
  return { success: true, data };
}

export function fail(
  code: string,
  message: string,
  details?: unknown,
): ApiErrorResponse {
  return {
    success: false,
    error: {
      code,
      message,
      ...(details !== undefined ? { details } : {}),
    },
  };
}

export type {
  AgentEvent,
  AgentStatusStage,
  AgentRunUiStatus,
  CitationReference,
  AgentStreamRequest,
  ConversationSummary,
  ConversationMessage,
} from "./agent-events.js";
