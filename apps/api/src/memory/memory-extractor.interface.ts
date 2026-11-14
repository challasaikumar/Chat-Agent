import type {
  MemoryExtractionRequest,
  MemoryExtractionResult,
} from "./memory.types.js";

export interface MemoryExtractor {
  extract(request: MemoryExtractionRequest): Promise<MemoryExtractionResult>;
}

export class MemoryConfigurationError extends Error {
  readonly code = "OPENAI_NOT_CONFIGURED";

  constructor(message = "OPENAI_API_KEY is not configured") {
    super(message);
    this.name = "MemoryConfigurationError";
  }
}

export class MemoryExtractionError extends Error {
  readonly code = "MEMORY_EXTRACTION_FAILED";

  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options?.cause !== undefined ? { cause: options.cause } : undefined);
    this.name = "MemoryExtractionError";
  }
}
