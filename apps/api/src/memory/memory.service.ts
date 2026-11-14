import type { Env } from "../config/env.js";
import type { AppDatabase } from "../db/index.js";
import type { MemoryExtractor } from "./memory-extractor.interface.js";
import { OpenAiMemoryExtractor } from "./memory-extractor.openai.js";
import { MemoryProcessor } from "./memory.processor.js";
import { MemoryRepository } from "./memory.repository.js";
import { RetrievalService, type MemorySearchParams } from "./retrieval.service.js";
import type { MemoryProcessResult } from "./memory.types.js";
import { EntityService } from "./entity.service.js";
import { FactService } from "./fact.service.js";
import { SummaryService } from "./summary.service.js";
import { AdvancedMemoryRetrievalService } from "./retrieval/memory-retrieval.service.js";
import { ProjectMemoryService } from "./projects/project-memory.service.js";
import { PreferenceService } from "./preferences/preference.service.js";
import { DecisionService } from "./decisions/decision.service.js";
import { MemoryPrivacyService } from "./privacy/memory-privacy.service.js";
import { MemoryRelationshipService } from "./entities/memory-relationship.service.js";
import { loadMemoryConfig } from "./memory.config.js";
import { detectConflicts } from "./consolidation/memory-conflict-detector.js";
import { findDuplicateGroups } from "./consolidation/memory-deduplicator.js";
import { FactRepository } from "../repositories/fact.repository.js";
import { eq, desc } from "drizzle-orm";
import { memoryIngestionRuns } from "../db/schema.js";

export class MemoryService {
  readonly repository: MemoryRepository;
  readonly retrieval: RetrievalService;
  readonly advancedRetrieval: AdvancedMemoryRetrievalService;
  readonly processor: MemoryProcessor;
  readonly entities: EntityService;
  readonly facts: FactService;
  readonly summaries: SummaryService;
  readonly projects: ProjectMemoryService;
  readonly preferences: PreferenceService;
  readonly decisions: DecisionService;
  readonly privacy: MemoryPrivacyService;
  readonly relationships: MemoryRelationshipService;
  private readonly factRepo: FactRepository;
  private readonly config;

  constructor(
    private readonly db: AppDatabase,
    env: Env,
    extractor?: MemoryExtractor,
  ) {
    this.config = loadMemoryConfig(env);
    this.repository = new MemoryRepository(db);
    this.retrieval = new RetrievalService(db, env);
    this.advancedRetrieval = new AdvancedMemoryRetrievalService(db, env);
    this.entities = new EntityService(db);
    this.facts = new FactService(db);
    this.summaries = new SummaryService(db);
    this.projects = new ProjectMemoryService(db);
    this.preferences = new PreferenceService(db, this.config);
    this.decisions = new DecisionService(db);
    this.privacy = new MemoryPrivacyService(db);
    this.relationships = new MemoryRelationshipService(db);
    this.factRepo = new FactRepository(db);
    this.processor = new MemoryProcessor(
      db,
      extractor ?? new OpenAiMemoryExtractor(env),
      env,
    );
  }

  async processConversation(
    conversationId: string,
    userId: string,
  ): Promise<MemoryProcessResult> {
    return this.processor.processConversation(conversationId, userId);
  }

  async search(userId: string, params: MemorySearchParams) {
    return this.retrieval.search(userId, params);
  }

  async overview(userId: string) {
    const counts = await this.factRepo.countForUser(userId);
    const projects = await this.projects.listProjects();
    const preferences = await this.preferences.list(userId, 20);
    const decisions = await this.decisions.list(userId, { includeHistory: false });
    const all = await this.factRepo.listForUser(userId, { limit: 300, activeOnly: false });
    const conflicts = detectConflicts(all);
    const lastRun = (await this.db
      .select()
      .from(memoryIngestionRuns)
      .where(eq(memoryIngestionRuns.userId, userId))
      .orderBy(desc(memoryIngestionRuns.createdAt)).limit(1))[0];

    return {
      counts,
      activeProjects: projects.map((p) => ({
        id: p.id,
        name: p.displayName,
      })),
      activePreferences: preferences.map((p) => ({
        id: p.id,
        fact: p.fact,
        confidence: p.confidence,
      })),
      confirmedDecisions: decisions
        .filter((d) => ["confirmed", "implemented"].includes(d.assertionStatus))
        .slice(0, 20)
        .map((d) => ({ id: d.id, fact: d.fact })),
      unresolvedConflicts: conflicts.filter((c) => !c.resolvable).length,
      lastProcessingAt: lastRun?.completedAt?.toISOString() ?? null,
    };
  }

  async consolidate(userId: string) {
    if (!this.config.consolidationEnabled) {
      return { duplicates: 0, conflicts: 0 };
    }
    const facts = await this.factRepo.listForUser(userId, {
      limit: 500,
      activeOnly: true,
    });
    const duplicates = findDuplicateGroups(facts);
    const conflicts = detectConflicts(facts);
    return {
      duplicateGroups: duplicates.length,
      conflicts: conflicts.length,
      conflictDetails: conflicts.map((c) => ({
        subjectKey: c.subjectKey,
        reason: c.reason,
        factIds: c.facts.map((f) => f.id),
      })),
    };
  }
}
