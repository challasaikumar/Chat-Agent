import type { DetectedConflict } from "../evidence.types.js";
import type { SourceAssessmentResult } from "../evidence.types.js";

export type ConflictResolution = {
  conflict: DetectedConflict;
  disposition:
    | "disclosed_unresolved"
    | "scoped_not_contradiction"
    | "prefer_fresher_first_party"
    | "historical_vs_current";
  explanation: string;
  preferredClaimId: string | null;
};

/**
 * Do not arbitrarily select one value. Prefer explaining scope/time differences
 * and disclosing unresolved conflicts.
 */
export class ConflictResolver {
  resolve(input: {
    conflicts: DetectedConflict[];
    assessmentsBySourceId?: Map<string, SourceAssessmentResult>;
  }): ConflictResolution[] {
    return input.conflicts.map((conflict) => {
      if (conflict.resolvableByScope) {
        return {
          conflict,
          disposition:
            conflict.scopeHint === "time"
              ? "historical_vs_current"
              : "scoped_not_contradiction",
          explanation: conflict.summary,
          preferredClaimId: null,
        };
      }

      const assessments = input.assessmentsBySourceId;
      if (assessments && conflict.sourceIds.length >= 2) {
        const ranked = conflict.sourceIds
          .map((id) => assessments.get(id))
          .filter(Boolean) as SourceAssessmentResult[];
        ranked.sort(
          (a, b) =>
            b.overallSuitabilityScore - a.overallSuitabilityScore ||
            b.freshnessScore - a.freshnessScore,
        );
        const best = ranked[0];
        if (
          best &&
          best.publisherRelationship === "first_party" &&
          best.freshnessCategory !== "stale" &&
          best.freshnessCategory !== "unknown"
        ) {
          return {
            conflict,
            disposition: "prefer_fresher_first_party",
            explanation: `${conflict.summary} Prefer fresher first-party source ${best.sourceId} without discarding others.`,
            preferredClaimId: conflict.claimIds[0] ?? null,
          };
        }
      }

      return {
        conflict,
        disposition: "disclosed_unresolved",
        explanation: `${conflict.summary} Conflict retained for disclosure.`,
        preferredClaimId: null,
      };
    });
  }
}
