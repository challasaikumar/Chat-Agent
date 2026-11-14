import { readdirSync, readFileSync, existsSync } from "node:fs";
import { join, resolve } from "node:path";
import {
  evaluationDatasetSchema,
  type EvaluationCase,
  type EvaluationDataset,
} from "./evaluation.schemas.js";

export type LoadedDataset = EvaluationDataset & {
  path: string;
};

export function loadDatasetFile(filePath: string): LoadedDataset {
  const absolute = resolve(filePath);
  if (!existsSync(absolute)) {
    throw new Error(`Dataset not found: ${absolute}`);
  }
  const raw = JSON.parse(readFileSync(absolute, "utf8")) as unknown;
  const parsed = evaluationDatasetSchema.safeParse(raw);
  if (!parsed.success) {
    const details = parsed.error.issues
      .map((i) => `${i.path.join(".")}: ${i.message}`)
      .join("; ");
    throw new Error(`Invalid dataset ${absolute}: ${details}`);
  }
  return { ...parsed.data, path: absolute };
}

export function loadDatasetsFromDirectory(
  directory: string,
  options: {
    dataset?: string;
    category?: string;
    caseId?: string;
    mode?: string;
    tags?: string[];
  } = {},
): { datasets: LoadedDataset[]; cases: Array<EvaluationCase & { datasetName: string; datasetVersion: number }> } {
  if (!existsSync(directory)) {
    return { datasets: [], cases: [] };
  }

  const files = readdirSync(directory)
    .filter((f) => f.endsWith(".json"))
    .sort();

  const datasets: LoadedDataset[] = [];
  const cases: Array<EvaluationCase & { datasetName: string; datasetVersion: number }> = [];

  for (const file of files) {
    const loaded = loadDatasetFile(join(directory, file));
    if (options.dataset && loaded.name !== options.dataset && file !== options.dataset) {
      continue;
    }
    datasets.push(loaded);
    for (const c of loaded.cases) {
      if (options.caseId && c.id !== options.caseId) continue;
      if (options.category && c.category !== options.category) continue;
      if (options.mode && c.mode !== options.mode) continue;
      if (options.tags?.length && !options.tags.every((t) => c.tags.includes(t))) {
        continue;
      }
      cases.push({
        ...c,
        datasetName: loaded.name,
        datasetVersion: loaded.version,
      });
    }
  }

  return { datasets, cases };
}

export function validateDatasetOrThrow(raw: unknown): EvaluationDataset {
  return evaluationDatasetSchema.parse(raw);
}
