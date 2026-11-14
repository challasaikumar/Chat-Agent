import { z } from "zod";
import { assertValidTimeZone } from "../utils/timezone.js";

export const agentTurnBodySchema = z
  .object({
    conversationId: z.string().uuid(),
    message: z
      .string()
      .transform((value) => value.trim())
      .pipe(
        z
          .string()
          .min(1, "Message is required")
          .max(12_000, "Message exceeds maximum length"),
      ),
    timeZone: z.string().min(1).max(100).optional(),
    clientRequestId: z.string().uuid().optional(),
  })
  .strict()
  .superRefine((value, ctx) => {
    if (!value.timeZone) {
      return;
    }
    try {
      assertValidTimeZone(value.timeZone);
    } catch {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `Invalid IANA time zone: ${value.timeZone}`,
        path: ["timeZone"],
      });
    }
  });

export type AgentTurnBody = z.infer<typeof agentTurnBodySchema>;

export const agentStreamBodySchema = agentTurnBodySchema;
export type AgentStreamBody = z.infer<typeof agentStreamBodySchema>;

export const webSearchArgsSchema = z
  .object({
    query: z
      .string()
      .transform((value) => value.trim())
      .pipe(z.string().min(1).max(400)),
    searchDepth: z.enum(["basic", "advanced"]),
    maxResults: z.number().int().min(1).max(8),
  })
  .strict();

export type WebSearchArgs = z.infer<typeof webSearchArgsSchema>;

export const finalAnswerSchema = z
  .object({
    answer: z.string().min(1),
    citations: z.array(z.string()).default([]),
  })
  .strict();

export type FinalAnswer = z.infer<typeof finalAnswerSchema>;

export const finalAnswerJsonSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    answer: { type: "string" },
    citations: {
      type: "array",
      items: { type: "string" },
    },
  },
  required: ["answer", "citations"],
} as const;

export const webSearchToolDefinition = {
  type: "function" as const,
  name: "web_search",
  description:
    "Search the web for current or externally verifiable information. Use for current facts, pricing, product updates, regulations, recent events and evidence needed to verify historical claims.",
  strict: true,
  parameters: {
    type: "object",
    additionalProperties: false,
    properties: {
      query: {
        type: "string",
        description: "A focused web search query",
      },
      searchDepth: {
        type: "string",
        enum: ["basic", "advanced"],
      },
      maxResults: {
        type: "integer",
        minimum: 1,
        maximum: 8,
      },
    },
    required: ["query", "searchDepth", "maxResults"],
  },
};
