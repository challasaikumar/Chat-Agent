import { describe, expect, it } from "vitest";
import { CitationRegistry } from "../apps/api/src/agent/citations/citation.registry.ts";
import { validateAndSanitizeAnswer } from "../apps/api/src/agent/citations/citation.validator.ts";

describe("citation validation", () => {
  it("keeps valid citations and strips invalid refs", () => {
    const registry = new CitationRegistry();
    registry.register({
      evidenceId: "web_src_1",
      sourceType: "web_search",
      title: "Neon",
      contentExcerpt: "pricing",
      url: "https://neon.tech/pricing",
      domain: "neon.tech",
      sourceMessageId: null,
      sourceFactId: null,
      sourceId: "1",
      snapshotId: "s1",
      observedAt: new Date().toISOString(),
      publishedAt: null,
      retrievedAt: new Date().toISOString(),
    });
    registry.register({
      evidenceId: "mem_msg_9",
      sourceType: "conversation_message",
      title: "user message",
      contentExcerpt: "asked about CRM",
      url: null,
      domain: null,
      sourceMessageId: 9,
      sourceFactId: null,
      sourceId: null,
      snapshotId: null,
      observedAt: new Date().toISOString(),
      publishedAt: null,
      retrievedAt: null,
    });

    const result = validateAndSanitizeAnswer(
      {
        answer:
          "Neon pricing [ref:web_src_1] vs invented [ref:web_src_999] and history [ref:mem_msg_9]",
        citations: ["web_src_1", "web_src_999", "mem_msg_9", "web_src_1"],
      },
      registry,
    );

    expect(result.citations.map((c) => c.evidenceId)).toEqual([
      "web_src_1",
      "mem_msg_9",
    ]);
    expect(result.removedCitationIds).toContain("web_src_999");
    expect(result.answer).not.toContain("web_src_999");
    expect(result.answer).toContain("[ref:web_src_1]");
  });

  it("preserves markdown newlines for tables and headings", () => {
    const registry = new CitationRegistry();
    const result = validateAndSanitizeAnswer(
      {
        answer:
          "Intro.\n\n## Comparison\n\n| A | B |\n|---|---|\n| 1 | 2 |\n\n- Takeaway",
        citations: [],
      },
      registry,
    );

    expect(result.answer).toContain("## Comparison");
    expect(result.answer).toMatch(/\| A \| B \|\n\|---\|---\|/);
    expect(result.answer).not.toMatch(/Intro\. ## Comparison/);
  });
});
