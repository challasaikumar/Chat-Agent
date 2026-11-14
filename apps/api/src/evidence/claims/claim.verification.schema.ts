import { z } from "zod";

export const verificationStatusSchema = z.enum([
  "supported",
  "partially_supported",
  "contradicted",
  "insufficient_evidence",
  "outdated_evidence",
  "conflicting_evidence",
  "not_verifiable",
]);

export const sufficiencyStatusSchema = z.enum([
  "sufficient",
  "partially_sufficient",
  "insufficient",
  "conflicting",
]);

export const claimVerificationOutcomeSchema = z.object({
  claimId: z.string(),
  status: verificationStatusSchema,
  sufficiencyStatus: sufficiencyStatusSchema,
  sourceCount: z.number().int().nonnegative(),
  independentSourceCount: z.number().int().nonnegative(),
  supportingSourceCount: z.number().int().nonnegative(),
  contradictingSourceCount: z.number().int().nonnegative(),
  assessmentSummary: z.string(),
});
