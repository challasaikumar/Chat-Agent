import type { ResearchSnapshot } from "../../db/schema.js";
import { normalizeEntityKey } from "../entities/entity-matcher.js";
import type { TemporalIntent } from "../temporal.types.js";
import { TemporalWindowService } from "../intent/temporal-window.service.js";

/**
 * Selects historical baselines — never picks the newest unrelated snapshot.
 */
export class EvidenceSelector {
  private readonly windows = new TemporalWindowService();

  selectHistoricalSnapshots(options: {
    snapshots: ResearchSnapshot[];
    intent: TemporalIntent;
    entityNames: string[];
    max: number;
  }): ResearchSnapshot[] {
    const window = this.windows.toWindow(options.intent);
    const entityKeys = options.entityNames.map(normalizeEntityKey);

    const scored = options.snapshots.map((snapshot) => {
      let score = 0;
      const queryKey = normalizeEntityKey(snapshot.query + " " + snapshot.title);

      if (
        window.start &&
        window.end &&
        this.windows.isWithinWindow(snapshot.capturedAt, window)
      ) {
        score += 50;
      }

      for (const key of entityKeys) {
        if (key && queryKey.includes(key)) {
          score += 30;
        }
      }

      // Prefer same-conversation relevance is applied by caller ordering;
      // mild recency within window only
      score += Math.min(
        10,
        Math.floor(snapshot.capturedAt.getTime() / 1e12),
      );

      return { snapshot, score };
    });

    return scored
      .filter((row) => row.score >= 30 || (window.start && row.score >= 50))
      .sort((a, b) => b.score - a.score || b.snapshot.capturedAt.getTime() - a.snapshot.capturedAt.getTime())
      .slice(0, options.max)
      .map((row) => row.snapshot);
  }
}
