import { randomUUID } from "node:crypto";
import type { AppDatabase } from "../../db/index.js";
import {
  entityMemorySummaries,
  type Entity,
  type EntityMemorySummary,
  type MemoryFact,
} from "../../db/schema.js";
import { EntityRepository } from "../../repositories/entity.repository.js";
import { FactRepository } from "../../repositories/fact.repository.js";
import { MemoryRelationshipService } from "../entities/memory-relationship.service.js";
import { eq, and, desc } from "drizzle-orm";

export class ProjectMemoryService {
  private readonly entities: EntityRepository;
  private readonly facts: FactRepository;
  private readonly relationships: MemoryRelationshipService;

  constructor(
    private readonly db: AppDatabase,
  ) {
    this.entities = new EntityRepository(db);
    this.facts = new FactRepository(db);
    this.relationships = new MemoryRelationshipService(db);
  }

  async listProjects(): Promise<Entity[]> {
    return this.entities.search({ entityType: "project", limit: 100 });
  }

  async ensureProject(displayName: string, aliases: string[] = []): Promise<Entity> {
    return this.entities.upsert({
      entityType: "project",
      displayName,
      aliases,
    });
  }

  async getProjectMemory(userId: string, projectId: string) {
    const project = await this.entities.findById(projectId);
    if (!project || project.entityType !== "project") {
      return null;
    }

    const facts = await this.facts.listForUser(userId, {
      limit: 200,
      entityId: projectId,
      activeOnly: false,
    });

    const current = facts.filter(
      (f) =>
        f.isActive &&
        !["superseded", "retracted"].includes(f.assertionStatus),
    );
    const historical = facts.filter((f) =>
      ["superseded", "considered", "proposed"].includes(f.assertionStatus),
    );
    const relationships = await this.relationships.listForEntity(userId, projectId, 100);
    const summary = await this.getLatestSummary(userId, projectId);

    return {
      project,
      currentFacts: current,
      historicalFacts: historical,
      relationships,
      summary,
      stack: current.filter((f) =>
        ["technical_context", "decision", "project_context"].includes(f.category),
      ),
      decisions: facts.filter((f) => f.category === "decision"),
      requirements: current.filter((f) =>
        ["requirement", "constraint", "goal"].includes(f.category),
      ),
    };
  }

  async getTimeline(userId: string, projectId: string): Promise<MemoryFact[]> {
    return (await this.facts
      .listForUser(userId, {
        limit: 200,
        entityId: projectId,
        activeOnly: false,
      }))
      .sort(
        (a, b) =>
          (a.observedAt ?? a.createdAt).getTime() -
          (b.observedAt ?? b.createdAt).getTime(),
      );
  }

  async writeSummary(input: {
    userId: string;
    entityId: string;
    summary: string;
    coveredThroughMessageId?: number | null;
    model: string;
  }): Promise<EntityMemorySummary> {
    const latest = await this.getLatestSummary(input.userId, input.entityId);
    const version = (latest?.version ?? 0) + 1;
    const id = randomUUID();
    await this.db
      .insert(entityMemorySummaries)
      .values({
        id,
        userId: input.userId,
        entityId: input.entityId,
        version,
        summary: input.summary,
        coveredThroughMessageId: input.coveredThroughMessageId ?? null,
        model: input.model,
        createdAt: new Date(),
      });
    return (await this.db
      .select()
      .from(entityMemorySummaries)
      .where(eq(entityMemorySummaries.id, id)).limit(1))[0]!;
  }

  async getLatestSummary(
    userId: string,
    entityId: string,
  ): Promise<EntityMemorySummary | undefined> {
    return (await this.db
      .select()
      .from(entityMemorySummaries)
      .where(
        and(
          eq(entityMemorySummaries.userId, userId),
          eq(entityMemorySummaries.entityId, entityId),
        ),
      )
      .orderBy(desc(entityMemorySummaries.version)).limit(1))[0];
  }
}
