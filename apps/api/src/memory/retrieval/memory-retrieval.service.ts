import type { Env } from "../../config/env.js";
import type { AppDatabase } from "../../db/index.js";
import { FTS_CONFIG } from "../../db/fts.js";
import type {
  Entity,
  MemoryEntityRelationship,
  MemoryFact,
} from "../../db/schema.js";
import { entities } from "../../db/schema.js";
import { eq, sql } from "drizzle-orm";
import { FactRepository } from "../../repositories/fact.repository.js";
import { EntityRepository } from "../../repositories/entity.repository.js";
import { SummaryRepository } from "../../repositories/summary.repository.js";
import { loadMemoryConfig } from "../memory.config.js";
import { analyzeMemoryQuery } from "./memory-query-analyzer.js";
import { rankMemoryFacts } from "./memory-ranker.js";
import { MemoryRelationshipService } from "../entities/memory-relationship.service.js";
import { sanitizeFtsQuery, toTsQuerySql } from "../../utils/fts-query.js";

export type AdvancedMemoryRetrievalInput = {
  userId: string;
  query: string;
  conversationId?: string;
  entityIds?: string[];
  projectIds?: string[];
  categories?: string[];
  timeZone?: string;
  maxResults?: number;
  maxCharacters?: number;
  includeHistorical?: boolean;
};

export type AdvancedMemoryRetrievalResult = {
  facts: MemoryFact[];
  projects: Entity[];
  preferences: MemoryFact[];
  decisions: MemoryFact[];
  relationships: MemoryEntityRelationship[];
  conversationSummaries: Array<{
    conversationId: string;
    version: number;
    summary: string;
  }>;
  explanation: {
    intent: string;
    candidateCount: number;
    selectedCount: number;
    durationMs: number;
    reasonsByFactId: Record<string, string[]>;
  };
};

export class AdvancedMemoryRetrievalService {
  private readonly config;
  private readonly facts: FactRepository;
  private readonly entities: EntityRepository;
  private readonly summaries: SummaryRepository;
  private readonly relationships: MemoryRelationshipService;

  constructor(
    private readonly db: AppDatabase,
    env: Env,
  ) {
    this.config = loadMemoryConfig(env);
    this.facts = new FactRepository(db);
    this.entities = new EntityRepository(db);
    this.summaries = new SummaryRepository(db);
    this.relationships = new MemoryRelationshipService(db);
  }

  async retrieve(input: AdvancedMemoryRetrievalInput): Promise<AdvancedMemoryRetrievalResult> {
    const started = Date.now();
    if (!this.config.enabled) {
      return emptyResult(started);
    }

    const analysis = analyzeMemoryQuery(input.query);
    const maxResults = Math.min(
      input.maxResults ?? this.config.maxRetrievalResults,
      this.config.maxRetrievalResults,
    );
    const maxChars = input.maxCharacters ?? this.config.maxContextChars;

    const projectEntities = (await this.entities
      .search({ entityType: "project", limit: 50 }))
      .filter(() => true);

    // Candidate pool: active + optionally superseded for history questions
    let candidates = await this.facts.listForUser(input.userId, {
      limit: 500,
      activeOnly: !(
        analysis.wantsHistorical ||
        analysis.wantsChangeHistory ||
        input.includeHistorical
      ),
    });

    if (
      analysis.wantsHistorical ||
      analysis.wantsChangeHistory ||
      input.includeHistorical
    ) {
      const historical = await this.facts.listForUser(input.userId, {
        limit: 500,
        activeOnly: false,
      });
      const byId = new Map(candidates.map((f) => [f.id, f]));
      for (const fact of historical) {
        if (
          fact.assertionStatus === "superseded" ||
          fact.assertionStatus === "considered" ||
          fact.assertionStatus === "proposed"
        ) {
          byId.set(fact.id, fact);
        }
      }
      candidates = [...byId.values()];
    }

    // Filter retracted always
    candidates = candidates.filter((f) => f.assertionStatus !== "retracted");

    if (input.categories?.length) {
      candidates = candidates.filter((f) => input.categories!.includes(f.category));
    } else if (analysis.categories.length > 0) {
      const filtered = candidates.filter((f) =>
        analysis.categories.includes(f.category),
      );
      if (filtered.length > 0) {
        candidates = filtered;
      }
    }

    if (input.entityIds?.length) {
      candidates = candidates.filter(
        (f) => f.entityId && input.entityIds!.includes(f.entityId),
      );
    }
    if (input.projectIds?.length) {
      candidates = candidates.filter(
        (f) => f.entityId && input.projectIds!.includes(f.entityId),
      );
    }

    // Confidence / importance floors (soft — keep high-importance exceptions)
    candidates = candidates.filter(
      (f) =>
        f.confidence >= this.config.minConfidence ||
        (f.importance ?? 0) >= Math.max(this.config.minImportance, 0.7),
    );

    const ftsBoostIds = await this.searchFts(input.userId, input.query);

    const ranked = rankMemoryFacts({
      facts: candidates,
      analysis,
      projectEntityIds: [
        ...projectEntities.map((p) => p.id),
        ...(input.projectIds ?? []),
      ],
      entityIds: input.entityIds,
      ftsBoostIds,
      decayEnabled: this.config.decayEnabled,
    });

    const selected: MemoryFact[] = [];
    let usedChars = 0;
    const reasonsByFactId: Record<string, string[]> = {};
    const byId = new Map(candidates.map((f) => [f.id, f]));

    for (const row of ranked) {
      if (selected.length >= maxResults) {
        break;
      }
      const fact = byId.get(row.factId);
      if (!fact || row.score < 0.08) {
        continue;
      }
      const size = fact.fact.length + fact.evidenceExcerpt.length;
      if (usedChars + size > maxChars && selected.length > 0) {
        continue;
      }
      selected.push(fact);
      usedChars += size;
      reasonsByFactId[fact.id] = row.reasons;
    }

    await this.facts.touchAccess(
      selected.map((f) => f.id),
      input.userId,
    );

    const preferences = selected.filter((f) => f.category === "preference");
    const decisions = selected.filter((f) => f.category === "decision");

    const relatedEntityIds = Array.from(
      new Set(selected.map((f) => f.entityId).filter(Boolean) as string[]),
    );
    const projects = projectEntities.filter(
      (p) =>
        relatedEntityIds.includes(p.id) ||
        selected.some((f) =>
          f.fact.toLowerCase().includes(p.displayName.toLowerCase()),
        ),
    );

    const relationships = (
      await Promise.all(
        relatedEntityIds.map((id) =>
          this.relationships.listForEntity(input.userId, id, 20),
        ),
      )
    ).flat();

    const conversationSummaries = input.conversationId
      ? await (async () => {
          const latest = await this.summaries.getLatest(input.conversationId!);
          return latest
            ? [
                {
                  conversationId: latest.conversationId,
                  version: latest.version,
                  summary: latest.summary,
                },
              ]
            : [];
        })()
      : [];

    return {
      facts: selected,
      projects,
      preferences,
      decisions,
      relationships: dedupeRelationships(relationships),
      conversationSummaries,
      explanation: {
        intent: analysis.intent,
        candidateCount: candidates.length,
        selectedCount: selected.length,
        durationMs: Date.now() - started,
        reasonsByFactId,
      },
    };
  }

  private async searchFts(userId: string, query: string): Promise<Set<string>> {
    const ftsQuery = sanitizeFtsQuery(query);
    if (!ftsQuery) {
      return new Set();
    }
    try {
      const tsQuery = toTsQuerySql(ftsQuery, FTS_CONFIG);
      const rows = (await this.db.execute(sql`
        SELECT f.id AS "factId"
        FROM memory_facts f
        WHERE f.user_id = ${userId}
          AND f.is_active = true
          AND f.assertion_status NOT IN ('retracted', 'superseded')
          AND f.search_vector @@ ${tsQuery}
        ORDER BY ts_rank_cd(f.search_vector, ${tsQuery}) DESC
        LIMIT 50
      `)) as unknown as Array<{ factId: string }>;
      return new Set(rows.map((r) => r.factId));
    } catch {
      return new Set();
    }
  }
}

function emptyResult(started: number): AdvancedMemoryRetrievalResult {
  return {
    facts: [],
    projects: [],
    preferences: [],
    decisions: [],
    relationships: [],
    conversationSummaries: [],
    explanation: {
      intent: "general",
      candidateCount: 0,
      selectedCount: 0,
      durationMs: Date.now() - started,
      reasonsByFactId: {},
    },
  };
}

function dedupeRelationships(
  rows: MemoryEntityRelationship[],
): MemoryEntityRelationship[] {
  const seen = new Set<string>();
  const out: MemoryEntityRelationship[] = [];
  for (const row of rows) {
    if (seen.has(row.id)) {
      continue;
    }
    seen.add(row.id);
    out.push(row);
  }
  return out;
}

void eq;
void entities;
