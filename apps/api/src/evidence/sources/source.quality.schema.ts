import { z } from "zod";

export const sourceAssessmentSchema = z.object({
  sourceId: z.string(),
  sourceType: z.string(),
  publisherRelationship: z.string(),
  domain: z.string(),
  authorityScore: z.number().min(0).max(1),
  relevanceScore: z.number().min(0).max(1),
  transparencyScore: z.number().min(0).max(1),
  freshnessScore: z.number().min(0).max(1),
  directnessScore: z.number().min(0).max(1),
  overallSuitabilityScore: z.number().min(0).max(1),
  freshnessCategory: z.enum([
    "current",
    "recent",
    "aging",
    "stale",
    "unknown",
  ]),
  assessmentStatus: z.enum(["assessed", "partially_assessed", "unknown"]),
  reasons: z.array(z.string()),
  suspiciousContent: z.boolean(),
  assessedAt: z.string(),
});
