import { z } from "zod";
import type { EvaluationConfig } from "../evaluation.config.js";
import {
  LLM_JUDGE_PROMPT_VERSION,
  LLM_JUDGE_RUBRIC_VERSION,
} from "../graders/answer-quality.grader.js";

export const llmJudgeResultSchema = z.object({
  completeness: z.number().min(0).max(1),
  clarity: z.number().min(0).max(1),
  relevance: z.number().min(0).max(1),
  uncertaintyCalibration: z.number().min(0).max(1),
  evidenceGrounding: z.number().min(0).max(1),
  explanation: z.string().min(1),
  humanReviewRecommended: z.boolean().default(false),
});

export type LlmJudgeResult = z.infer<typeof llmJudgeResultSchema>;

export type LlmJudgeRecord = {
  enabled: boolean;
  model: string;
  promptVersion: string;
  rubricVersion: string;
  result: LlmJudgeResult | null;
  error?: string;
};

/**
 * Optional supplemental qualitative judge. Never used for exact numeric/
 * historical correctness. Disabled unless EVAL_LLM_JUDGE_ENABLED=true.
 */
export async function maybeRunLlmJudge(
  config: EvaluationConfig,
  input: {
    question: string;
    answer: string;
    evidenceSummary: string;
    criteria: string[];
  },
  createJson?: (prompt: string) => Promise<unknown>,
): Promise<LlmJudgeRecord> {
  if (!config.llmJudgeEnabled) {
    return {
      enabled: false,
      model: config.llmJudgeModel,
      promptVersion: LLM_JUDGE_PROMPT_VERSION,
      rubricVersion: LLM_JUDGE_RUBRIC_VERSION,
      result: null,
    };
  }

  if (!createJson) {
    return {
      enabled: true,
      model: config.llmJudgeModel,
      promptVersion: LLM_JUDGE_PROMPT_VERSION,
      rubricVersion: LLM_JUDGE_RUBRIC_VERSION,
      result: null,
      error: "LLM judge callback not provided",
    };
  }

  const prompt = [
    "You are an independent answer-quality judge. Do not invent external facts.",
    "Score only using the provided evidence. Return JSON matching the schema.",
    `Rubric version: ${LLM_JUDGE_RUBRIC_VERSION}`,
    `Question: ${input.question}`,
    `Criteria: ${input.criteria.join("; ")}`,
    `Evidence:\n${input.evidenceSummary}`,
    `Answer:\n${input.answer}`,
  ].join("\n\n");

  try {
    const raw = await createJson(prompt);
    const result = llmJudgeResultSchema.parse(raw);
    return {
      enabled: true,
      model: config.llmJudgeModel,
      promptVersion: LLM_JUDGE_PROMPT_VERSION,
      rubricVersion: LLM_JUDGE_RUBRIC_VERSION,
      result,
    };
  } catch (error) {
    return {
      enabled: true,
      model: config.llmJudgeModel,
      promptVersion: LLM_JUDGE_PROMPT_VERSION,
      rubricVersion: LLM_JUDGE_RUBRIC_VERSION,
      result: null,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}
