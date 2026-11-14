import { z } from "zod";

export const evaluationModeSchema = z.enum([
  "deterministic",
  "integration",
  "live",
]);

export const searchFixtureSchema = z.object({
  queryContains: z.string().optional(),
  queryEquals: z.string().optional(),
  results: z.array(
    z.object({
      title: z.string(),
      url: z.string().url(),
      domain: z.string(),
      content: z.string(),
      score: z.number().nullable().optional(),
      publishedAt: z.string().nullable().optional(),
      contentHash: z.string().optional(),
    }),
  ),
});

export const claimFixtureSchema = z.object({
  entityName: z.string(),
  category: z.enum([
    "pricing",
    "feature",
    "product_release",
    "availability",
    "plan",
    "limit",
    "policy",
    "other",
  ]),
  attribute: z.string(),
  originalValue: z.string(),
  normalizedValue: z.string().optional(),
  numericValue: z.string().optional(),
  currency: z.string().optional(),
  billingPeriod: z.string().optional(),
  planName: z.string().optional(),
  region: z.string().optional(),
  sourceUrl: z.string(),
  evidenceExcerpt: z.string(),
  observedAt: z.string(),
  publishedAt: z.string().nullable().optional(),
  effectiveAt: z.string().nullable().optional(),
  contentHash: z.string().optional(),
});

export const messageFixtureSchema = z.object({
  role: z.enum(["user", "assistant", "system", "tool"]),
  content: z.string(),
  createdAt: z.string().optional(),
});

export const conversationFixtureSchema = z.object({
  id: z.string().uuid().optional(),
  title: z.string(),
  createdAt: z.string().optional(),
  messages: z.array(messageFixtureSchema).default([]),
});

export const snapshotFixtureSchema = z.object({
  id: z.string().uuid().optional(),
  conversationKey: z.string(),
  query: z.string(),
  title: z.string(),
  capturedAt: z.string(),
  sources: z.array(
    z.object({
      title: z.string(),
      url: z.string(),
      domain: z.string(),
      content: z.string(),
      publishedAt: z.string().nullable().optional(),
      contentHash: z.string().optional(),
      score: z.number().nullable().optional(),
    }),
  ),
});

export const memoryFactFixtureSchema = z.object({
  category: z.string(),
  memoryKey: z.string(),
  value: z.string(),
  importance: z.number().min(0).max(1).optional(),
  confidence: z.number().min(0).max(1).optional(),
  entityName: z.string().optional(),
});

export const expectedSchema = z.object({
  entities: z.array(z.string()).optional(),
  historicalDate: z.string().optional(),
  resolvedWeekday: z.string().optional(),
  mustSearch: z.boolean().optional(),
  mustNotSearch: z.boolean().optional(),
  maxSearchCalls: z.number().int().nonnegative().optional(),
  priceComparisons: z
    .array(
      z.object({
        entity: z.string(),
        attribute: z.string().optional(),
        planName: z.string().optional(),
        historicalValue: z.string(),
        currentValue: z.string(),
        absoluteDifference: z.string().optional(),
        percentageDifference: z.string().optional(),
        changeType: z.string().optional(),
      }),
    )
    .optional(),
  changeTypes: z.array(z.string()).optional(),
  forbiddenChangeTypes: z.array(z.string()).optional(),
  citationsRequired: z.boolean().optional(),
  invalidCitationIds: z.array(z.string()).optional(),
  answerMustContain: z.array(z.string()).optional(),
  answerMustNotContain: z.array(z.string()).optional(),
  verificationStatuses: z.array(z.string()).optional(),
  independentSourceMax: z.number().int().positive().optional(),
  freshnessCategories: z.array(z.string()).optional(),
  conversationTitleContains: z.string().optional(),
  historicalMustContain: z.array(z.string()).optional(),
  memoryKeys: z.array(z.string()).optional(),
});

export const gradingSchema = z.object({
  critical: z.array(z.string()).default([]),
  soft: z.array(z.string()).default([]),
  useLlmJudge: z.boolean().default(false),
});

export const evaluationCaseSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  version: z.number().int().positive().default(1),
  category: z.string().min(1),
  description: z.string().default(""),
  tags: z.array(z.string()).default([]),
  mode: evaluationModeSchema.default("deterministic"),
  clock: z
    .object({
      now: z.string(),
      timeZone: z.string().default("Asia/Kolkata"),
    })
    .optional(),
  initialState: z
    .object({
      conversations: z.array(conversationFixtureSchema).default([]),
      snapshots: z.array(snapshotFixtureSchema).default([]),
      claims: z.array(claimFixtureSchema).default([]),
      memoryFacts: z.array(memoryFactFixtureSchema).default([]),
    })
    .default({}),
  conversationSequence: z
    .array(
      z.object({
        conversationKey: z.string().optional(),
        message: z.string(),
        expectSearch: z.boolean().optional(),
      }),
    )
    .default([]),
  searchFixtures: z.array(searchFixtureSchema).default([]),
  openaiFixtures: z
    .array(
      z.object({
        whenInputContains: z.string().optional(),
        finalAnswer: z
          .object({
            answer: z.string(),
            citations: z.array(z.string()).default([]),
          })
          .optional(),
        functionCalls: z
          .array(
            z.object({
              name: z.literal("web_search"),
              arguments: z.record(z.unknown()),
            }),
          )
          .optional(),
      }),
    )
    .default([]),
  expected: expectedSchema.default({}),
  grading: gradingSchema.default({}),
  limits: z
    .object({
      timeoutMs: z.number().int().positive().optional(),
      maxSearches: z.number().int().nonnegative().optional(),
    })
    .default({}),
});

export const evaluationDatasetSchema = z.object({
  name: z.string(),
  version: z.number().int().positive(),
  description: z.string().default(""),
  cases: z.array(evaluationCaseSchema).min(1),
});

export type EvaluationCase = z.infer<typeof evaluationCaseSchema>;
export type EvaluationDataset = z.infer<typeof evaluationDatasetSchema>;
export type ExpectedSpec = z.infer<typeof expectedSchema>;
