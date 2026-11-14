import type { ResearchSnapshot } from "../../db/schema.js";
import { formatCalendarDate, localCalendarToday } from "./temporal-date.utils.js";
import { getZonedParts } from "../../utils/timezone.js";
import type { TemporalIntent } from "../temporal.types.js";
import { temporalIntentSchema } from "../temporal.schemas.js";

/**
 * Resolves open-ended temporal references using actual research / message timestamps.
 */
export class TemporalIntentResolver {
  resolve(options: {
    intent: TemporalIntent;
    historicalSnapshots: ResearchSnapshot[];
    latestMessageAt?: Date | null;
    now?: Date;
  }): TemporalIntent {
    const intent = { ...options.intent };
    const now = options.now ?? new Date();

    if (
      (intent.referenceType === "previous_research" ||
        intent.referenceType === "previous_conversation") &&
      !intent.startDate
    ) {
      const snapshot = options.historicalSnapshots[0];
      if (snapshot) {
        const parts = getZonedParts(snapshot.capturedAt, intent.timeZone);
        intent.startDate = formatCalendarDate(parts.year, parts.month, parts.day);
        intent.endDate = intent.startDate;
        intent.ambiguous = false;
        intent.ambiguityReason = null;
      } else if (options.latestMessageAt) {
        const parts = getZonedParts(options.latestMessageAt, intent.timeZone);
        intent.startDate = formatCalendarDate(parts.year, parts.month, parts.day);
        intent.endDate = intent.startDate;
        intent.ambiguous = false;
        intent.ambiguityReason = null;
      } else {
        intent.ambiguous = true;
        intent.ambiguityReason =
          "Could not resolve previous research/conversation timestamp";
      }
    }

    // Prefer actual snapshot captured_at when an exact historical snapshot exists
    // for the resolved window — never invent dates beyond calendar resolution.
    if (intent.startDate && options.historicalSnapshots.length > 0) {
      const matching = options.historicalSnapshots.find((snap) => {
        const parts = getZonedParts(snap.capturedAt, intent.timeZone);
        const date = formatCalendarDate(parts.year, parts.month, parts.day);
        return date === intent.startDate || date === intent.endDate;
      });
      if (matching) {
        const parts = getZonedParts(matching.capturedAt, intent.timeZone);
        const captured = formatCalendarDate(parts.year, parts.month, parts.day);
        // Keep calendar day from snapshot when available for previous_research
        if (intent.referenceType === "previous_research") {
          intent.startDate = captured;
          intent.endDate = captured;
        }
      }
    }

    const today = localCalendarToday(now, intent.timeZone);
    intent.comparisonDate = formatCalendarDate(today.year, today.month, today.day);

    return temporalIntentSchema.parse(intent);
  }
}
