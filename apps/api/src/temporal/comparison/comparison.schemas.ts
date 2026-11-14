import { z } from "zod";

export const confidenceSchema = z.enum([
  "HIGH",
  "MEDIUM",
  "LOW",
  "INSUFFICIENT",
]);

export const comparisonStatusSchema = z.enum([
  "completed",
  "partially_completed",
  "insufficient_evidence",
  "conflicting_evidence",
  "failed",
]);

export const comparisonItemSchema = z.object({
  attribute: z.string(),
  category: z.string(),
  changeType: z.string(),
  historicalValue: z.string().nullable(),
  currentValue: z.string().nullable(),
  absoluteDifference: z.string().nullable(),
  percentageDifference: z.string().nullable(),
  currency: z.string().nullable(),
  billingPeriod: z.string().nullable(),
  confidence: confidenceSchema,
});
