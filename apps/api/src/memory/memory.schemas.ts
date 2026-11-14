import { z } from "zod";

export const entityTypeSchema = z.enum([
  "user",
  "project",
  "company",
  "product",
  "technology",
  "person",
  "service",
  "organization",
  "topic",
  "other",
]);

export const factCategorySchema = z.enum([
  "user_context",
  "project_context",
  "preference",
  "decision",
  "requirement",
  "goal",
  "constraint",
  "technical_context",
  "relationship",
  "research_reference",
  "other",
]);

export const memoryTypeSchema = z.enum([
  "episodic",
  "semantic",
  "project",
  "preference",
  "decision",
  "relationship",
]);

export const assertionTypeSchema = z.enum([
  "explicitly_stated",
  "repeated_statement",
  "confirmed_inference",
  "unconfirmed_inference",
]);

export const assertionStatusSchema = z.enum([
  "proposed",
  "considered",
  "confirmed",
  "implemented",
  "rejected",
  "superseded",
  "retracted",
  "uncertain",
]);

export const extractedEntitySchema = z.object({
  entityType: entityTypeSchema,
  displayName: z.string().min(1).max(200),
  aliases: z.array(z.string().min(1).max(200)).max(20).default([]),
  supportingMessageIds: z.array(z.number().int().positive()).max(50).default([]),
});

export const extractedFactSchema = z.object({
  category: factCategorySchema,
  fact: z.string().min(1).max(1000),
  confidence: z.number().min(0).max(1),
  importance: z.number().min(0).max(1).optional().default(0.5),
  memoryType: memoryTypeSchema.optional().default("semantic"),
  memoryKey: z.string().min(1).max(300).nullable().optional(),
  normalizedValue: z.string().min(1).max(500).nullable().optional(),
  assertionType: assertionTypeSchema.optional().default("explicitly_stated"),
  assertionStatus: assertionStatusSchema.optional().default("confirmed"),
  sourceMessageId: z.number().int().positive(),
  evidenceExcerpt: z.string().min(1).max(2000),
  entityDisplayName: z.string().min(1).max(200).nullable().optional(),
  entityType: entityTypeSchema.nullable().optional(),
  projectDisplayName: z.string().min(1).max(200).nullable().optional(),
  supersedesMemoryKey: z.string().min(1).max(300).nullable().optional(),
});

export const extractedRelationshipSchema = z.object({
  sourceEntityDisplayName: z.string().min(1).max(200),
  sourceEntityType: entityTypeSchema,
  targetEntityDisplayName: z.string().min(1).max(200),
  targetEntityType: entityTypeSchema,
  relationshipType: z.string().min(1).max(100),
  description: z.string().max(500).nullable().optional(),
  confidence: z.number().min(0).max(1).default(0.8),
  sourceMessageId: z.number().int().positive().nullable().optional(),
});

export const memoryExtractionResultSchema = z.object({
  summary: z.string().min(1).max(8000),
  entities: z.array(extractedEntitySchema).max(50).default([]),
  facts: z.array(extractedFactSchema).max(50).default([]),
  relationships: z.array(extractedRelationshipSchema).max(50).default([]),
  supportingMessageIds: z.array(z.number().int().positive()).max(100).default([]),
});

export type ValidatedMemoryExtraction = z.infer<typeof memoryExtractionResultSchema>;

export const factPatchSchema = z
  .object({
    fact: z.string().min(1).max(1000).optional(),
    assertionStatus: assertionStatusSchema.optional(),
    isActive: z.boolean().optional(),
    importance: z.number().min(0).max(1).optional(),
    correctionNote: z.string().max(1000).optional(),
  })
  .strict()
  .refine(
    (value) =>
      value.fact !== undefined ||
      value.assertionStatus !== undefined ||
      value.isActive !== undefined ||
      value.importance !== undefined,
    { message: "At least one mutable field is required" },
  );

export const advancedMemorySearchQuerySchema = z.object({
  q: z.string().max(500).optional(),
  category: factCategorySchema.optional(),
  entityId: z.string().uuid().optional(),
  projectId: z.string().uuid().optional(),
  status: assertionStatusSchema.optional(),
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  timeZone: z.string().min(1).max(100).optional(),
  conversationId: z.string().uuid().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(25),
  cursor: z.string().min(1).optional(),
});

/** JSON Schema for OpenAI structured output (strict-compatible). */
export const memoryExtractionJsonSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    summary: { type: "string" },
    entities: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          entityType: {
            type: "string",
            enum: [
              "user",
              "project",
              "company",
              "product",
              "technology",
              "person",
              "service",
              "organization",
              "topic",
              "other",
            ],
          },
          displayName: { type: "string" },
          aliases: { type: "array", items: { type: "string" } },
          supportingMessageIds: { type: "array", items: { type: "integer" } },
        },
        required: [
          "entityType",
          "displayName",
          "aliases",
          "supportingMessageIds",
        ],
      },
    },
    facts: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          category: {
            type: "string",
            enum: [
              "user_context",
              "project_context",
              "preference",
              "decision",
              "requirement",
              "goal",
              "constraint",
              "technical_context",
              "relationship",
              "research_reference",
              "other",
            ],
          },
          fact: { type: "string" },
          confidence: { type: "number" },
          importance: { type: "number" },
          memoryType: {
            type: "string",
            enum: [
              "episodic",
              "semantic",
              "project",
              "preference",
              "decision",
              "relationship",
            ],
          },
          memoryKey: { type: ["string", "null"] },
          normalizedValue: { type: ["string", "null"] },
          assertionType: {
            type: "string",
            enum: [
              "explicitly_stated",
              "repeated_statement",
              "confirmed_inference",
              "unconfirmed_inference",
            ],
          },
          assertionStatus: {
            type: "string",
            enum: [
              "proposed",
              "considered",
              "confirmed",
              "implemented",
              "rejected",
              "superseded",
              "retracted",
              "uncertain",
            ],
          },
          sourceMessageId: { type: "integer" },
          evidenceExcerpt: { type: "string" },
          entityDisplayName: { type: ["string", "null"] },
          entityType: {
            type: ["string", "null"],
            enum: [
              "user",
              "project",
              "company",
              "product",
              "technology",
              "person",
              "service",
              "organization",
              "topic",
              "other",
              null,
            ],
          },
          projectDisplayName: { type: ["string", "null"] },
          supersedesMemoryKey: { type: ["string", "null"] },
        },
        required: [
          "category",
          "fact",
          "confidence",
          "importance",
          "memoryType",
          "memoryKey",
          "normalizedValue",
          "assertionType",
          "assertionStatus",
          "sourceMessageId",
          "evidenceExcerpt",
          "entityDisplayName",
          "entityType",
          "projectDisplayName",
          "supersedesMemoryKey",
        ],
      },
    },
    relationships: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          sourceEntityDisplayName: { type: "string" },
          sourceEntityType: {
            type: "string",
            enum: [
              "user",
              "project",
              "company",
              "product",
              "technology",
              "person",
              "service",
              "organization",
              "topic",
              "other",
            ],
          },
          targetEntityDisplayName: { type: "string" },
          targetEntityType: {
            type: "string",
            enum: [
              "user",
              "project",
              "company",
              "product",
              "technology",
              "person",
              "service",
              "organization",
              "topic",
              "other",
            ],
          },
          relationshipType: { type: "string" },
          description: { type: ["string", "null"] },
          confidence: { type: "number" },
          sourceMessageId: { type: ["integer", "null"] },
        },
        required: [
          "sourceEntityDisplayName",
          "sourceEntityType",
          "targetEntityDisplayName",
          "targetEntityType",
          "relationshipType",
          "description",
          "confidence",
          "sourceMessageId",
        ],
      },
    },
    supportingMessageIds: { type: "array", items: { type: "integer" } },
  },
  required: [
    "summary",
    "entities",
    "facts",
    "relationships",
    "supportingMessageIds",
  ],
} as const;
