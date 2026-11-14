import type { ClaimCategory } from "../../db/schema.js";
import { FRESHNESS_POLICY_DAYS } from "../evidence.config.js";
import type {
  FreshnessAssessment,
  FreshnessCategory,
  SourceDateType,
} from "../evidence.types.js";

export type FreshnessInput = {
  publishedAt?: Date | string | null;
  updatedAt?: Date | string | null;
  effectiveAt?: Date | string | null;
  retrievedAt?: Date | string | null;
  snapshotCapturedAt?: Date | string | null;
  claimCategory?: ClaimCategory | null;
  now?: Date;
};

/**
 * Distinguishes published_at / updated_at / effective_at / retrieved_at /
 * snapshot_captured_at. Never marks an undated source as current merely
 * because it was retrieved today.
 */
export function assessFreshness(input: FreshnessInput): FreshnessAssessment {
  const now = input.now ?? new Date();
  const policy =
    FRESHNESS_POLICY_DAYS[input.claimCategory ?? "default"] ??
    FRESHNESS_POLICY_DAYS.default;

  const candidates: Array<{
    dateType: SourceDateType;
    value: Date;
    priority: number;
  }> = [];

  pushCandidate(candidates, "effective_at", input.effectiveAt, 1);
  pushCandidate(candidates, "updated_at", input.updatedAt, 2);
  pushCandidate(candidates, "published_at", input.publishedAt, 3);

  if (candidates.length === 0) {
    const retrieved = toDate(input.retrievedAt) ?? toDate(input.snapshotCapturedAt);
    return {
      freshnessCategory: "unknown",
      ageInDays: null,
      relevantReferenceTimestamp: retrieved?.toISOString() ?? null,
      sourceDateType: retrieved
        ? input.retrievedAt
          ? "retrieved_at"
          : "snapshot_captured_at"
        : "retrieved_at",
      reasons: [
        "no_publication_or_effective_date",
        "retrieval_date_is_not_content_currency",
      ],
      freshnessScore: 0.25,
    };
  }

  candidates.sort((a, b) => a.priority - b.priority);
  const chosen = candidates[0]!;
  const ageInDays = diffDays(now, chosen.value);
  const freshnessCategory = categorizeAge(ageInDays, policy);
  const freshnessScore = scoreFromCategory(freshnessCategory);

  const reasons = [
    `used_${chosen.dateType}`,
    `age_days_${ageInDays}`,
    `category_${freshnessCategory}`,
    `policy_${input.claimCategory ?? "default"}`,
  ];

  if (
    input.effectiveAt &&
    input.publishedAt &&
    toDate(input.effectiveAt)?.getTime() !== toDate(input.publishedAt)?.getTime()
  ) {
    reasons.push("effective_date_differs_from_publication_date");
  }

  return {
    freshnessCategory,
    ageInDays,
    relevantReferenceTimestamp: chosen.value.toISOString(),
    sourceDateType: chosen.dateType,
    reasons,
    freshnessScore,
  };
}

function categorizeAge(
  ageInDays: number,
  policy: { current: number; recent: number; aging: number },
): FreshnessCategory {
  if (ageInDays <= policy.current) {
    return "current";
  }
  if (ageInDays <= policy.recent) {
    return "recent";
  }
  if (ageInDays <= policy.aging) {
    return "aging";
  }
  return "stale";
}

function scoreFromCategory(category: FreshnessCategory): number {
  switch (category) {
    case "current":
      return 1;
    case "recent":
      return 0.75;
    case "aging":
      return 0.45;
    case "stale":
      return 0.2;
    default:
      return 0.25;
  }
}

function pushCandidate(
  list: Array<{ dateType: SourceDateType; value: Date; priority: number }>,
  dateType: SourceDateType,
  raw: Date | string | null | undefined,
  priority: number,
): void {
  const value = toDate(raw);
  if (value) {
    list.push({ dateType, value, priority });
  }
}

function toDate(value: Date | string | null | undefined): Date | null {
  if (!value) {
    return null;
  }
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value;
  }
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function diffDays(now: Date, then: Date): number {
  return Math.max(0, Math.floor((now.getTime() - then.getTime()) / 86_400_000));
}
