import { z } from "zod";

export const sourceIdParamsSchema = z.object({
  id: z.string().min(1).max(128),
});

export const claimIdParamsSchema = z.object({
  id: z.string().min(1).max(128),
});

export const snapshotIdParamsSchema = z.object({
  id: z.string().min(1).max(128),
});

export const verificationIdParamsSchema = z.object({
  id: z.string().min(1).max(128),
});

export const evidencePaginationSchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(20),
  offset: z.coerce.number().int().min(0).default(0),
});

export const modelEvidenceClassificationSchema = z.object({
  relationship: z.enum([
    "supports",
    "partially_supports",
    "contradicts",
    "contextualizes",
    "mentions",
    "insufficient",
  ]),
  directness: z.enum(["direct", "indirect", "ambiguous"]),
  confidence: z.number().min(0).max(1),
  reasoningSummary: z.string().min(1).max(500),
  evidenceExcerpt: z.string().min(1).max(2000),
});
