import type { ExpectedSpec } from "../evaluation.schemas.js";
import type { GradeAssertion } from "../evaluation.types.js";
import { assertExcludes, assertIncludes } from "./deterministic.grader.js";

export function gradeAnswerQuality(
  expected: ExpectedSpec,
  answer: string,
): GradeAssertion[] {
  const assertions: GradeAssertion[] = [];

  if (expected.answerMustContain?.length) {
    assertions.push(
      assertIncludes(
        "answer.contains",
        "Answer contains required factual substrings",
        answer,
        expected.answerMustContain,
        { failureCategory: "UNSUPPORTED_CLAIM" },
      ),
    );
  }

  if (expected.answerMustNotContain?.length) {
    assertions.push(
      assertExcludes(
        "answer.excludes",
        "Answer avoids forbidden content",
        answer,
        expected.answerMustNotContain,
        { failureCategory: "UNSUPPORTED_CLAIM" },
      ),
    );
  }

  return assertions;
}

/** Optional structured LLM-judge schema (validated when live judge enabled). */
export const LLM_JUDGE_PROMPT_VERSION = "judge-v1";
export const LLM_JUDGE_RUBRIC_VERSION = "rubric-v1";
