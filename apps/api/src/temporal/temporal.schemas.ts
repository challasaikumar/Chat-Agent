import { z } from "zod";

export const changeCategorySchema = z.enum([
  "pricing",
  "features",
  "product_updates",
  "availability",
  "general",
]);

export const temporalIntentSchema = z.object({
  isComparison: z.boolean(),
  referenceType: z.enum([
    "explicit_date",
    "relative_date",
    "previous_research",
    "previous_conversation",
    "date_range",
    "unknown",
  ]),
  originalExpression: z.string().nullable(),
  startDate: z.string().nullable(),
  endDate: z.string().nullable(),
  comparisonDate: z.string(),
  timeZone: z.string().min(1),
  comparisonTargets: z.array(z.string()),
  changeCategories: z.array(changeCategorySchema),
  ambiguous: z.boolean(),
  ambiguityReason: z.string().nullable(),
});

export const temporalPreviewBodySchema = z
  .object({
    conversationId: z.string().uuid(),
    entityNames: z.array(z.string().min(1).max(200)).max(20).default([]),
    fromDate: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/)
      .optional(),
    toDate: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/)
      .optional(),
    timeZone: z.string().min(1).max(64).optional(),
    categories: z.array(changeCategorySchema).max(10).optional(),
  })
  .strict();

export type TemporalPreviewBody = z.infer<typeof temporalPreviewBodySchema>;

export const claimCategorySchema = z.enum([
  "pricing",
  "feature",
  "product_release",
  "availability",
  "plan",
  "limit",
  "policy",
  "other",
]);

export const extractedClaimSchema = z.object({
  entityName: z.string().min(1).max(200),
  category: claimCategorySchema,
  attribute: z.string().min(1).max(200),
  value: z.string().min(1).max(500),
  currency: z.string().nullable().optional(),
  billingPeriod: z.string().nullable().optional(),
  billingBasis: z.string().nullable().optional(),
  unit: z.string().nullable().optional(),
  planName: z.string().nullable().optional(),
  region: z.string().nullable().optional(),
  seatCount: z.number().int().positive().nullable().optional(),
  featureName: z.string().nullable().optional(),
  publishedAt: z.string().nullable().optional(),
  effectiveAt: z.string().nullable().optional(),
  evidenceExcerpt: z.string().min(1).max(2000),
  extractionConfidence: z.number().min(0).max(1),
});

export const extractedClaimsResultSchema = z.object({
  claims: z.array(extractedClaimSchema).max(50),
});

export type ExtractedClaimInput = z.infer<typeof extractedClaimSchema>;

export const claimExtractionJsonSchema = {
  type: "object",
  additionalProperties: false,
  required: ["claims"],
  properties: {
    claims: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: [
          "entityName",
          "category",
          "attribute",
          "value",
          "evidenceExcerpt",
          "extractionConfidence",
        ],
        properties: {
          entityName: { type: "string" },
          category: {
            type: "string",
            enum: [
              "pricing",
              "feature",
              "product_release",
              "availability",
              "plan",
              "limit",
              "policy",
              "other",
            ],
          },
          attribute: { type: "string" },
          value: { type: "string" },
          currency: { type: ["string", "null"] },
          billingPeriod: { type: ["string", "null"] },
          billingBasis: { type: ["string", "null"] },
          unit: { type: ["string", "null"] },
          planName: { type: ["string", "null"] },
          region: { type: ["string", "null"] },
          seatCount: { type: ["integer", "null"] },
          featureName: { type: ["string", "null"] },
          publishedAt: { type: ["string", "null"] },
          effectiveAt: { type: ["string", "null"] },
          evidenceExcerpt: { type: "string" },
          extractionConfidence: { type: "number" },
        },
      },
    },
  },
} as const;
