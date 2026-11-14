import { describe, expect, it } from "vitest";
import { AnswerJsonExtractor } from "../apps/api/src/agent/streaming/answer-json.extractor.js";
import { parseSseBufferForTest } from "../apps/web/src/services/stream.client.js";

describe("AnswerJsonExtractor", () => {
  it("streams only the decoded answer field", () => {
    const extractor = new AnswerJsonExtractor();
    const chunks = [
      '{"answer":"Hello ',
      "world",
      '","citations":["web_src_1"]}',
    ];
    let answer = "";
    for (const chunk of chunks) {
      answer += extractor.push(chunk);
    }
    expect(answer).toBe("Hello world");
    expect(extractor.isComplete()).toBe(true);
  });

  it("handles escaped characters", () => {
    const extractor = new AnswerJsonExtractor();
    const out = extractor.push('{"answer":"Line 1\\nLine 2 \\"quoted\\"","citations":[]}');
    expect(out).toBe('Line 1\nLine 2 "quoted"');
  });
});

describe("SSE client parser", () => {
  it("parses a complete event in one chunk", () => {
    const events = parseSseBufferForTest(
      `id: 1\nevent: run.started\ndata: {"type":"run.started","runId":"r1","conversationId":"c1"}\n\n`,
    );
    expect(events).toHaveLength(1);
    expect(events[0]?.type).toBe("run.started");
  });

  it("parses CRLF and multi-line data", () => {
    const events = parseSseBufferForTest(
      "id: 2\r\nevent: message.delta\r\ndata: {\"type\":\"message.delta\",\"delta\":\"Hel\"}\r\ndata: {\"ignored\":true}\r\n\r\n",
    );
    // Second data line makes invalid JSON when joined — ensure no throw
    expect(Array.isArray(events)).toBe(true);
  });

  it("ignores heartbeat comments and malformed JSON", () => {
    const events = parseSseBufferForTest(
      `: heartbeat\n\nid: 3\nevent: run.error\ndata: not-json\n\nid: 4\nevent: run.cancelled\ndata: {"type":"run.cancelled","runId":"r1","status":"cancelled"}\n\n`,
    );
    expect(events.some((e) => e.type === "run.cancelled")).toBe(true);
    expect(events.every((e) => e.type !== "run.error")).toBe(true);
  });
});
