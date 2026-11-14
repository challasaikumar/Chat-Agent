import type { ExpectedSpec } from "../evaluation.schemas.js";
import type { GradeAssertion } from "../evaluation.types.js";
import { assertIncludes } from "./deterministic.grader.js";
import { entityMatchRate } from "../metrics/accuracy.metrics.js";
import {
  meanReciprocalRank,
  precisionAtK,
  recallAtK,
} from "../metrics/retrieval.metrics.js";

export function gradeMemoryEntities(
  expected: ExpectedSpec,
  retrievedEntityNames: string[],
): { assertions: GradeAssertion[]; metrics: Record<string, number | null> } {
  const assertions: GradeAssertion[] = [];
  const expectedEntities = expected.entities ?? [];

  if (expectedEntities.length > 0) {
    const rate = entityMatchRate(expectedEntities, retrievedEntityNames);
    assertions.push({
      id: "memory.entities",
      description: "Expected entities retrieved",
      passed: rate != null && rate >= 1,
      expected: expectedEntities,
      actual: retrievedEntityNames,
      explanation:
        rate != null && rate >= 1
          ? "All expected entities present"
          : `Entity match rate ${rate}`,
      failureCategory: "ENTITY_MATCH_FAILURE",
      critical: true,
    });
  }

  const metrics = {
    entityMatchRate: entityMatchRate(expectedEntities, retrievedEntityNames),
    precisionAt5: precisionAtK(retrievedEntityNames, expectedEntities, 5),
    recallAt5: recallAtK(retrievedEntityNames, expectedEntities, 5),
    mrr: meanReciprocalRank(retrievedEntityNames, expectedEntities),
  };

  return { assertions, metrics };
}

export function gradeConversationRecall(
  expected: ExpectedSpec,
  conversationTitles: string[],
  messageContents: string[],
  historicalMustContain: string[] = [],
): GradeAssertion[] {
  const assertions: GradeAssertion[] = [];
  if (expected.conversationTitleContains) {
    const haystack = conversationTitles.join("\n");
    assertions.push(
      assertIncludes(
        "memory.conversationTitle",
        "Historical conversation title recalled",
        haystack,
        [expected.conversationTitleContains],
        { failureCategory: "WRONG_CONVERSATION" },
      ),
    );
  }
  // answerMustContain grades the agent answer — not seeded history.
  if (historicalMustContain.length > 0) {
    assertions.push(
      assertIncludes(
        "memory.messageContent",
        "Historical message content recalled",
        messageContents.join("\n"),
        historicalMustContain,
        { failureCategory: "MEMORY_RETRIEVAL_FAILURE" },
      ),
    );
  }
  return assertions;
}
