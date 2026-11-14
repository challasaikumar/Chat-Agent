import { createEvaluationDatabase, type SeededEvaluationDatabase } from "./fixture.database.js";
import { createFixedClock, type Clock, SystemClock } from "./fixture.clock.js";
import { createFixtureSearchProvider, type FixtureSearchProvider } from "./fixture.search-provider.js";
import { createFixtureOpenAiProvider } from "./fixture.openai-provider.js";
import type { EvaluationCase } from "../evaluation.schemas.js";
import type { ResponsesClient } from "../../agent/openai/responses.client.js";

export type EvaluationFixtureBundle = {
  db: SeededEvaluationDatabase;
  clock: Clock;
  search: FixtureSearchProvider;
  openai: ResponsesClient & {
    callCount: number;
    usageTotals: { input: number; output: number; cached: number };
  };
  timeZone: string;
  cleanup: () => void;
};

export async function loadCaseFixtures(caseSpec: EvaluationCase): Promise<EvaluationFixtureBundle> {
  const timeZone = caseSpec.clock?.timeZone ?? "Asia/Kolkata";
  const clock = caseSpec.clock?.now
    ? createFixedClock(caseSpec.clock.now)
    : new SystemClock();
  const db = await createEvaluationDatabase(caseSpec);
  const search = createFixtureSearchProvider(caseSpec.searchFixtures, { clock });
  const openai = createFixtureOpenAiProvider(caseSpec.openaiFixtures);

  return {
    db,
    clock,
    search,
    openai,
    timeZone,
    cleanup: async () => db.cleanup(),
  };
}
