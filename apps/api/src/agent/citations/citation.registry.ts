import type { EvidenceRecord } from "./citation.types.js";

export class CitationRegistry {
  private readonly byId = new Map<string, EvidenceRecord>();

  register(record: EvidenceRecord): void {
    this.byId.set(record.evidenceId, record);
  }

  has(evidenceId: string): boolean {
    return this.byId.has(evidenceId);
  }

  get(evidenceId: string): EvidenceRecord | undefined {
    return this.byId.get(evidenceId);
  }

  list(): EvidenceRecord[] {
    return [...this.byId.values()];
  }

  resolve(citationIds: string[]): {
    valid: EvidenceRecord[];
    invalid: string[];
  } {
    const valid: EvidenceRecord[] = [];
    const invalid: string[] = [];
    const seen = new Set<string>();

    for (const id of citationIds) {
      if (seen.has(id)) {
        continue;
      }
      seen.add(id);
      const record = this.byId.get(id);
      if (record) {
        valid.push(record);
      } else {
        invalid.push(id);
      }
    }

    return { valid, invalid };
  }

  catalogText(maxChars = 6000): string {
    const lines = this.list().map((item) => {
      const parts = [
        `${item.evidenceId}`,
        `type=${item.sourceType}`,
        `title=${item.title}`,
      ];
      if (item.url) {
        parts.push(`url=${item.url}`);
      }
      if (item.observedAt) {
        parts.push(`observedAt=${item.observedAt}`);
      }
      if (item.publishedAt) {
        parts.push(`publishedAt=${item.publishedAt}`);
      }
      if (item.retrievedAt) {
        parts.push(`retrievedAt=${item.retrievedAt}`);
      }
      parts.push(`excerpt=${item.contentExcerpt.slice(0, 280)}`);
      return `- ${parts.join(" | ")}`;
    });

    let text = "Evidence catalog (cite only these IDs):\n" + lines.join("\n");
    if (text.length > maxChars) {
      text = `${text.slice(0, maxChars - 1)}…`;
    }
    return text;
  }
}
