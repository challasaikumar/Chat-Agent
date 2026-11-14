import type { AgentEvent } from "@minimi/shared";
import { API_BASE, getCsrfToken } from "./api.client.js";

export type SseHandlers = {
  onEvent: (event: AgentEvent) => void;
  onError?: (error: Error) => void;
  signal?: AbortSignal;
};

/**
 * POST + ReadableStream SSE parser.
 * Maintains an incomplete buffer across network chunks.
 */
export async function consumeAgentSse(
  path: string,
  body: unknown,
  handlers: SseHandlers,
): Promise<void> {
  const headers: Record<string, string> = {
    "content-type": "application/json",
    accept: "text/event-stream",
  };
  const csrf = getCsrfToken();
  if (csrf) {
    headers["x-csrf-token"] = csrf;
  }

  const response = await fetch(`${API_BASE}${path}`, {
    method: "POST",
    credentials: "include",
    headers,
    body: JSON.stringify(body),
    signal: handlers.signal,
  });

  if (!response.ok) {
    let message = `Stream failed (${response.status})`;
    try {
      const json = (await response.json()) as {
        error?: { message?: string };
      };
      if (json.error?.message) {
        message = json.error.message;
      }
    } catch {
      // ignore
    }
    throw new Error(message);
  }

  if (!response.body) {
    throw new Error("Streaming response body is empty");
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) {
        break;
      }
      buffer += decoder.decode(value, { stream: true });
      buffer = buffer.replace(/\r\n/g, "\n");

      let separator = buffer.indexOf("\n\n");
      while (separator !== -1) {
        const rawEvent = buffer.slice(0, separator);
        buffer = buffer.slice(separator + 2);
        dispatchSseBlock(rawEvent, handlers);
        separator = buffer.indexOf("\n\n");
      }
    }

    if (buffer.trim()) {
      dispatchSseBlock(buffer, handlers);
    }
  } catch (error) {
    if (handlers.signal?.aborted) {
      return;
    }
    const err = error instanceof Error ? error : new Error("Stream interrupted");
    handlers.onError?.(err);
    throw err;
  } finally {
    try {
      reader.releaseLock();
    } catch {
      // already released
    }
  }
}

function dispatchSseBlock(rawEvent: string, handlers: SseHandlers): void {
  const lines = rawEvent.split("\n");
  let eventName = "message";
  const dataLines: string[] = [];

  for (const line of lines) {
    if (!line || line.startsWith(":")) {
      continue;
    }
    if (line.startsWith("event:")) {
      eventName = line.slice(6).trim();
      continue;
    }
    if (line.startsWith("data:")) {
      dataLines.push(line.slice(5).trimStart());
    }
  }

  if (dataLines.length === 0) {
    return;
  }

  const data = dataLines.join("\n");
  try {
    const parsed = JSON.parse(data) as AgentEvent;
    if (!parsed || typeof parsed !== "object" || !("type" in parsed)) {
      return;
    }
    // Prefer payload type; fall back to SSE event name if needed
    if (!parsed.type && eventName) {
      (parsed as { type: string }).type = eventName;
    }
    handlers.onEvent(parsed);
  } catch {
    // Malformed JSON — ignore safely
  }
}

/** Exported for unit tests */
export function parseSseBufferForTest(raw: string): AgentEvent[] {
  const events: AgentEvent[] = [];
  const normalized = raw.replace(/\r\n/g, "\n");
  const blocks = normalized.split("\n\n").filter(Boolean);
  for (const block of blocks) {
    dispatchSseBlock(block, {
      onEvent: (event) => events.push(event),
    });
  }
  return events;
}
