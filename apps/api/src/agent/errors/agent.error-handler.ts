import { AppError } from "../../utils/errors.js";
import { AgentError } from "./agent.errors.js";
import { SearchError } from "../../search/search.interface.js";

export function translateAgentError(error: unknown): never {
  if (error instanceof AgentError) {
    throw new AppError(error.message, {
      statusCode: error.statusCode,
      code: error.code,
      details: error.details,
      cause: error,
    });
  }
  if (error instanceof SearchError) {
    throw new AppError(error.message, {
      statusCode: error.statusCode,
      code: error.code,
      details: error.details,
      cause: error,
    });
  }
  if (error instanceof AppError) {
    throw error;
  }
  throw error;
}
