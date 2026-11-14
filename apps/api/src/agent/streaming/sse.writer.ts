import type { FastifyReply, FastifyRequest } from "fastify";
import type { AgentEvent } from "@minimi/shared";

export type SseWriter = {
  send: (event: AgentEvent) => boolean;
  comment: (text: string) => boolean;
  close: () => void;
  get closed(): boolean;
  get eventCount(): number;
  get droppedEvents(): number;
  flush: () => void;
};

const MAX_BUFFERED_EVENTS = 64;

/**
 * SSE writer with bounded buffering / backpressure.
 * When the socket buffer is full, events queue up to MAX_BUFFERED_EVENTS;
 * beyond that, heartbeat comments are dropped first, then oldest queued events.
 *
 * Fastify corks responses during request handling. Hijacked SSE must uncork
 * after writes or the client receives headers with an empty body forever
 * (UI stuck on "Sending…").
 */
export function createSseWriter(
  request: FastifyRequest,
  reply: FastifyReply,
): SseWriter {
  let closed = false;
  let eventId = 0;
  let droppedEvents = 0;
  let draining = false;
  const queue: string[] = [];

  reply.hijack();

  if (!reply.raw.headersSent) {
    reply.raw.writeHead(200, {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    });
  }

  try {
    reply.raw.socket?.setNoDelay(true);
  } catch {
    // ignore
  }

  const flushSocket = () => {
    // Fastify corks the raw response; without uncork, writes never leave Node.
    while ((reply.raw.writableCorked ?? 0) > 0) {
      reply.raw.uncork();
    }
  };

  const tryWrite = (chunk: string): boolean => {
    if (closed || reply.raw.writableEnded || reply.raw.destroyed) {
      closed = true;
      return false;
    }
    try {
      const ok = reply.raw.write(chunk);
      flushSocket();
      if (!ok && !draining) {
        draining = true;
        reply.raw.once("drain", () => {
          draining = false;
          flushQueue();
        });
      }
      return true;
    } catch {
      closed = true;
      return false;
    }
  };

  const enqueue = (chunk: string, droppable: boolean): boolean => {
    if (closed) return false;
    if (!draining && queue.length === 0) {
      return tryWrite(chunk);
    }
    if (queue.length >= MAX_BUFFERED_EVENTS) {
      if (droppable) {
        droppedEvents += 1;
        return true;
      }
      queue.shift();
      droppedEvents += 1;
    }
    queue.push(chunk);
    if (!draining) {
      flushQueue();
    }
    return true;
  };

  const flushQueue = () => {
    while (queue.length > 0 && !closed) {
      const next = queue[0]!;
      const ok = tryWrite(next);
      if (!ok) break;
      if (draining) break;
      queue.shift();
    }
  };

  tryWrite(": connected\n\n");

  const onClose = () => {
    closed = true;
    queue.length = 0;
  };
  // Use the response stream — request.raw "close" fires when the POST body ends.
  reply.raw.on("close", onClose);

  return {
    get closed() {
      return closed || reply.raw.writableEnded || reply.raw.destroyed;
    },
    get eventCount() {
      return eventId;
    },
    get droppedEvents() {
      return droppedEvents;
    },
    flush() {
      flushQueue();
      flushSocket();
    },
    send(event: AgentEvent): boolean {
      if (this.closed) {
        return false;
      }
      eventId += 1;
      const payload = `id: ${eventId}\nevent: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`;
      return enqueue(payload, false);
    },
    comment(text: string): boolean {
      if (this.closed) {
        return false;
      }
      return enqueue(`: ${text}\n\n`, true);
    },
    close() {
      if (closed || reply.raw.writableEnded) {
        closed = true;
        reply.raw.off("close", onClose);
        return;
      }
      closed = true;
      queue.length = 0;
      reply.raw.off("close", onClose);
      try {
        flushSocket();
        reply.raw.end();
      } catch {
        // already closed
      }
    },
  };
}
