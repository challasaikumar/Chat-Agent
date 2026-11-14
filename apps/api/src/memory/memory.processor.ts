import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import type { Env } from "../config/env.js";
import type { AppDatabase } from "../db/index.js";
import { memoryIngestionRuns } from "../db/schema.js";
import { ConversationRepository } from "../repositories/conversation.repository.js";
import { MessageRepository } from "../repositories/message.repository.js";
import { AppError } from "../utils/errors.js";
import {
  MemoryConfigurationError,
  MemoryExtractionError,
  type MemoryExtractor,
} from "./memory-extractor.interface.js";
import { EntityService } from "./entity.service.js";
import { FactService } from "./fact.service.js";
import { SummaryService } from "./summary.service.js";
import type { MemoryProcessResult } from "./memory.types.js";
import { loadMemoryConfig } from "./memory.config.js";
import { ProjectMemoryService } from "./projects/project-memory.service.js";

export class MemoryProcessor {
  private readonly conversations: ConversationRepository;
  private readonly messages: MessageRepository;
  private readonly summaries: SummaryService;
  private readonly entities: EntityService;
  private readonly facts: FactService;
  private readonly projects: ProjectMemoryService;
  private readonly config;

  constructor(
    private readonly db: AppDatabase,
    private readonly extractor: MemoryExtractor,
    private readonly env: Env,
  ) {
    this.conversations = new ConversationRepository(db);
    this.messages = new MessageRepository(db);
    this.summaries = new SummaryService(db);
    this.entities = new EntityService(db);
    this.facts = new FactService(db);
    this.projects = new ProjectMemoryService(db);
    this.config = loadMemoryConfig(env);
  }

  async processConversation(
    conversationId: string,
    userId: string,
  ): Promise<MemoryProcessResult> {
    if (!this.config.enabled) {
      throw new AppError("Memory processing is disabled", {
        statusCode: 503,
        code: "MEMORY_DISABLED",
      });
    }

    const conversation = await this.conversations.findByIdForUser(conversationId, userId);
    if (!conversation) {
      throw new AppError("Conversation not found", {
        statusCode: 404,
        code: "NOT_FOUND",
      });
    }

    const latestSummary = await this.summaries.getLatest(conversationId);
    const uncovered = await this.messages.listAfterId(
      conversationId,
      latestSummary?.coveredThroughMessageId ?? null,
    );

    if (uncovered.length === 0 && latestSummary) {
      return {
        conversationId,
        summaryVersion: latestSummary.version,
        summary: latestSummary.summary,
        coveredThroughMessageId: latestSummary.coveredThroughMessageId,
        entitiesUpserted: 0,
        factsUpserted: 0,
        relationshipsUpserted: 0,
        duplicatesRejected: 0,
        conflictsDetected: 0,
        model: latestSummary.model,
      };
    }

    const messagesForExtraction =
      uncovered.length > 0
        ? uncovered
        : (await this.messages.listForConversation(conversationId, {
            limit: this.config.messageLimit,
            order: "asc",
          })).items;

    if (messagesForExtraction.length === 0) {
      throw new AppError("Conversation has no messages to process", {
        statusCode: 400,
        code: "NO_MESSAGES",
      });
    }

    const runId = randomUUID();
    await this.db
      .insert(memoryIngestionRuns)
      .values({
        id: runId,
        userId,
        conversationId,
        status: "processing",
        coveredFromMessageId: messagesForExtraction[0]?.id ?? null,
        coveredThroughMessageId: null,
        startedAt: new Date(),
        createdAt: new Date(),
      });

    let extraction;
    try {
      extraction = await this.extractor.extract({
        conversationId,
        previousSummary: latestSummary?.summary ?? null,
        messages: messagesForExtraction,
        model: this.env.OPENAI_MODEL,
      });
    } catch (error) {
      await this.db
        .update(memoryIngestionRuns)
        .set({
          status: "retryable",
          errorCategory:
            error instanceof MemoryConfigurationError
              ? error.code
              : error instanceof MemoryExtractionError
                ? error.code
                : "EXTRACTION_FAILED",
          errorMessage: error instanceof Error ? error.message : "extraction failed",
          completedAt: new Date(),
        })
        .where(eq(memoryIngestionRuns.id, runId));

      if (error instanceof MemoryConfigurationError) {
        throw new AppError(error.message, {
          statusCode: 503,
          code: error.code,
        });
      }
      if (error instanceof MemoryExtractionError) {
        throw new AppError(error.message, {
          statusCode: 502,
          code: error.code,
        });
      }
      throw error;
    }

    const validMessageIds = new Set(messagesForExtraction.map((m) => m.id));
    const coveredThroughMessageId = Math.max(
      ...messagesForExtraction.map((m) => m.id),
    );

    try {
      const result = await this.db.transaction(async (tx: AppDatabase) => {
        const txSummaries = new SummaryService(tx);
        const txEntities = new EntityService(tx);
        const txFacts = new FactService(tx);
        const txProjects = new ProjectMemoryService(tx);

        const summary = await txSummaries.createVersion({
          conversationId,
          summary: extraction.summary,
          coveredThroughMessageId,
          model: this.env.OPENAI_MODEL,
        });

        const entities = await txEntities.upsertExtracted(
          conversationId,
          extraction.entities.filter(
            (entity) =>
              entity.supportingMessageIds.every((id) => validMessageIds.has(id)) ||
              entity.supportingMessageIds.length === 0,
          ),
        );

        const limitedFacts = extraction.facts.slice(
          0,
          this.config.maxFactsPerExtraction,
        );
        const factResult = await txFacts.upsertExtracted(
          userId,
          conversationId,
          limitedFacts,
          validMessageIds,
        );

        const relationshipsUpserted = await txFacts.upsertRelationships(
          userId,
          conversationId,
          extraction.relationships ?? [],
          validMessageIds,
        );

        // Project summaries for project entities touched in this extraction
        for (const entity of entities.filter((e) => e.entityType === "project")) {
          const projectFacts = factResult.facts.filter((f) => f.entityId === entity.id);
          if (projectFacts.length === 0) {
            continue;
          }
          await txProjects.writeSummary({
            userId,
            entityId: entity.id,
            summary: [
              `Project: ${entity.displayName}`,
              ...projectFacts
                .slice(0, 12)
                .map(
                  (f) =>
                    `- [${f.assertionStatus}] ${f.fact}`,
                ),
            ].join("\n"),
            coveredThroughMessageId,
            model: this.env.OPENAI_MODEL,
          });
        }

        return {
          conversationId,
          summaryVersion: summary.version,
          summary: summary.summary,
          coveredThroughMessageId: summary.coveredThroughMessageId,
          entitiesUpserted: entities.length,
          factsUpserted: factResult.facts.length,
          relationshipsUpserted,
          duplicatesRejected: factResult.duplicatesRejected,
          conflictsDetected: factResult.conflictsDetected,
          model: summary.model,
          ingestionRunId: runId,
        };
      });

      await this.db
        .update(memoryIngestionRuns)
        .set({
          status: "completed",
          coveredThroughMessageId,
          factsCreated: result.factsUpserted,
          relationshipsCreated: result.relationshipsUpserted ?? 0,
          duplicatesRejected: result.duplicatesRejected ?? 0,
          conflictsDetected: result.conflictsDetected ?? 0,
          completedAt: new Date(),
        })
        .where(eq(memoryIngestionRuns.id, runId));

      return result;
    } catch (error) {
      await this.db
        .update(memoryIngestionRuns)
        .set({
          status: "failed",
          errorCategory: "PERSISTENCE_FAILED",
          errorMessage: error instanceof Error ? error.message : "persist failed",
          completedAt: new Date(),
        })
        .where(eq(memoryIngestionRuns.id, runId));
      throw error;
    }
  }
}
