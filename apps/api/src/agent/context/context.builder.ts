import type { Env } from "../../config/env.js";
import type { AppDatabase } from "../../db/index.js";
import type { Message } from "../../db/schema.js";
import { MessageRepository } from "../../repositories/message.repository.js";
import { SummaryRepository } from "../../repositories/summary.repository.js";
import { FactRepository } from "../../repositories/fact.repository.js";
import { EntityRepository } from "../../repositories/entity.repository.js";
import { ResearchRepository } from "../../repositories/research.repository.js";
import { RetrievalService } from "../../memory/retrieval.service.js";
import { AdvancedMemoryRetrievalService } from "../../memory/retrieval/memory-retrieval.service.js";
import { getZonedParts } from "../../utils/timezone.js";
import type { AgentConfig } from "../agent.config.js";
import { CitationRegistry } from "../citations/citation.registry.js";
import type { EvidenceRecord } from "../citations/citation.types.js";
import { DateIntentParser } from "./context.date-parser.js";
import { trimToBudget } from "./context.budget.js";
import type { BuiltContext } from "./context.types.js";

export class ContextBuilder {
  private readonly messages: MessageRepository;
  private readonly summaries: SummaryRepository;
  private readonly facts: FactRepository;
  private readonly entities: EntityRepository;
  private readonly research: ResearchRepository;
  private readonly retrieval: RetrievalService;
  private readonly advancedMemory: AdvancedMemoryRetrievalService;
  private readonly dateParser = new DateIntentParser();

  constructor(
    db: AppDatabase,
    private readonly env: Env,
    private readonly config: AgentConfig,
  ) {
    this.messages = new MessageRepository(db);
    this.summaries = new SummaryRepository(db);
    this.facts = new FactRepository(db);
    this.entities = new EntityRepository(db);
    this.research = new ResearchRepository(db);
    this.retrieval = new RetrievalService(db, env);
    this.advancedMemory = new AdvancedMemoryRetrievalService(db, env);
  }

  async build(options: {
    userId: string;
    conversationId: string;
    userMessageId: number;
    userMessage: string;
    timeZone: string;
    registry: CitationRegistry;
    now?: Date;
  }): Promise<BuiltContext> {
    const now = options.now ?? new Date();
    const parts = getZonedParts(now, options.timeZone);
    const localDate = `${parts.year}-${String(parts.month).padStart(2, "0")}-${String(parts.day).padStart(2, "0")}`;

    const dateIntent = this.dateParser.parse(options.userMessage, {
      timeZone: options.timeZone,
      now,
      preferPast: true,
    });

    const recent = (await this.messages
      .listForConversation(options.conversationId, {
        limit: this.config.maxRecentMessages,
        order: "desc",
      }))
      .items.reverse();

    const summary = await this.summaries.getLatest(options.conversationId);

    // Advanced memory retrieval — ranked, project-aware, budgeted.
    // Current user message corrections take priority over retrieved memory.
    const memoryHit = await this.advancedMemory.retrieve({
      userId: options.userId,
      query: options.userMessage,
      conversationId: options.conversationId,
      maxResults: this.config.maxMemoryFacts,
      maxCharacters: Math.min(
        this.env.MEMORY_MAX_CONTEXT_CHARS,
        this.config.maxContextChars,
      ),
      includeHistorical:
        /\b(originally|previously|history|changed|before|was)\b/i.test(
          options.userMessage,
        ),
    });

    let facts = memoryHit.facts;
    if (facts.length === 0) {
      facts = await this.facts.listForUser(options.userId, {
        limit: this.config.maxMemoryFacts,
        activeOnly: true,
      });
    }

    // Current-message corrections must not be overridden by stale confirmed memory.
    // Keep all facts; instructions tell the model current corrections win.

    const entities = await this.entities.listForConversation(options.conversationId);

    let historicalMessages: Message[] = [];
    if (dateIntent) {
      const retrieved = await this.retrieval.search(options.userId, {
        date: dateIntent.kind === "absolute_day" ? dateIntent.date : undefined,
        from: dateIntent.kind === "relative_range" ? dateIntent.from : undefined,
        to: dateIntent.kind === "relative_range" ? dateIntent.to : undefined,
        timeZone: options.timeZone,
        limit: this.config.maxRecentMessages,
      });
      historicalMessages = retrieved.messages;
    } else {
      // Keyword-assisted historical retrieval for non-date questions.
      const keywords = options.userMessage
        .split(/\s+/)
        .map((token) => token.replace(/[^a-zA-Z0-9]/g, ""))
        .filter((token) => token.length >= 4)
        .slice(0, 4)
        .join(" ");
      if (keywords) {
        historicalMessages = (await this.retrieval.search(options.userId, {
          q: keywords,
          limit: Math.min(8, this.config.maxRecentMessages),
        })).messages;
      }
    }

    const researchPage = await this.research.listSnapshotsForUser(options.userId, {
      limit: this.config.maxResearchSnapshots,
    });
    const researchSnapshots = researchPage.items;
    const researchSources = (
      await Promise.all(
        researchSnapshots.map(async (snapshot) =>
          (await this.research.listSourcesForSnapshot(snapshot.id)).map((source) => ({
            snapshot,
            source,
          })),
        ),
      )
    ).flat();

    // Register evidence
    for (const message of [...recent, ...historicalMessages]) {
      const evidenceId = `mem_msg_${message.id}`;
      const record: EvidenceRecord = {
        evidenceId,
        sourceType: "conversation_message",
        title: `${message.role} message #${message.id}`,
        contentExcerpt: message.content.slice(0, 500),
        url: null,
        domain: null,
        sourceMessageId: message.id,
        sourceFactId: null,
        sourceId: null,
        snapshotId: null,
        observedAt: message.createdAt.toISOString(),
        publishedAt: null,
        retrievedAt: null,
      };
      options.registry.register(record);
    }

    for (const fact of facts) {
      const evidenceId = `mem_fact_${fact.id}`;
      options.registry.register({
        evidenceId,
        sourceType: "memory_fact",
        title: fact.fact.slice(0, 120),
        contentExcerpt: fact.evidenceExcerpt.slice(0, 500),
        url: null,
        domain: null,
        sourceMessageId: fact.sourceMessageId,
        sourceFactId: fact.id,
        sourceId: null,
        snapshotId: null,
        observedAt: fact.createdAt.toISOString(),
        publishedAt: null,
        retrievedAt: null,
      });
    }

    for (const { snapshot, source } of researchSources) {
      const evidenceId = `research_src_${source.id}`;
      options.registry.register({
        evidenceId,
        sourceType: "historical_research",
        title: source.title,
        contentExcerpt: source.contentExcerpt.slice(0, 500),
        url: source.url,
        domain: source.domain,
        sourceMessageId: null,
        sourceFactId: null,
        sourceId: source.id,
        snapshotId: snapshot.id,
        observedAt: snapshot.capturedAt.toISOString(),
        publishedAt: source.publishedAt?.toISOString() ?? null,
        retrievedAt: source.retrievedAt.toISOString(),
      });
    }

    const runtime = [
      `Runtime context:`,
      `- conversationId: ${options.conversationId}`,
      `- userMessageId: ${options.userMessageId}`,
      `- currentUtc: ${now.toISOString()}`,
      `- timeZone: ${options.timeZone}`,
      `- localDate: ${localDate}`,
      dateIntent
        ? `- dateIntent: ${dateIntent.label} (${dateIntent.kind === "absolute_day" ? dateIntent.date : `${dateIntent.from}..${dateIntent.to}`})`
        : `- dateIntent: none`,
    ].join("\n");

    const summarySection = summary
      ? `Conversation summary (v${summary.version}):\n${summary.summary}`
      : "Conversation summary: (none)";

    const recentSection = [
      "Recent conversation messages:",
      ...recent.map(
        (message) =>
          `#${message.id} [${message.role}] (${message.createdAt.toISOString()}): ${message.content}`,
      ),
    ].join("\n");

    const historicalSection =
      historicalMessages.length > 0
        ? [
            "Historical messages matching the question:",
            ...historicalMessages.map(
              (message) =>
                `#${message.id} [${message.role}] (${message.createdAt.toISOString()}): ${message.content}`,
            ),
          ].join("\n")
        : "Historical messages matching the question: (none found)";

    const factsSection =
      facts.length > 0
        ? [
            "Memory facts (ranked; do not override an explicit current-message correction):",
            `Retrieval intent: ${memoryHit.explanation.intent}`,
            ...facts.map((fact) => {
              const reasons =
                memoryHit.explanation.reasonsByFactId[fact.id]?.join(",") ?? "";
              return `- [${`mem_fact_${fact.id}`}] (${fact.category}, status=${fact.assertionStatus}, confidence=${fact.confidence}, importance=${fact.importance}${reasons ? `, reasons=${reasons}` : ""}): ${fact.fact}`;
            }),
            memoryHit.projects.length > 0
              ? `Related projects: ${memoryHit.projects.map((p) => p.displayName).join(", ")}`
              : "",
            memoryHit.relationships.length > 0
              ? `Relationships: ${memoryHit.relationships
                  .slice(0, 12)
                  .map((r) => `${r.relationshipType}`)
                  .join(", ")}`
              : "",
          ]
            .filter(Boolean)
            .join("\n")
        : "Memory facts: (none)";

    const entitiesSection =
      entities.length > 0
        ? [
            "Entities in this conversation:",
            ...entities.map(
              (entity) =>
                `- ${entity.displayName} (${entity.entityType})`,
            ),
          ].join("\n")
        : "Entities in this conversation: (none)";

    const researchSection =
      researchSnapshots.length > 0
        ? [
            "Historical research snapshots:",
            ...researchSnapshots.map((snapshot) => {
              const sources = researchSources
                .filter((item) => item.snapshot.id === snapshot.id)
                .slice(0, 3)
                .map(
                  (item) =>
                    `  - [${`research_src_${item.source.id}`}] ${item.source.title} (${item.source.domain}) retrieved=${item.source.retrievedAt.toISOString()}`,
                )
                .join("\n");
              return `- snapshot ${snapshot.id} query="${snapshot.query}" captured=${snapshot.capturedAt.toISOString()}\n${sources}`;
            }),
          ].join("\n")
        : "Historical research snapshots: (none)";

    const evidenceSection = options.registry.catalogText(
      Math.floor(this.config.maxContextChars / 3),
    );

    const currentQuestion = `Current user question:\n${options.userMessage}`;

    const promptText = trimToBudget(
      [
        runtime,
        currentQuestion,
        historicalSection,
        researchSection,
        factsSection,
        entitiesSection,
        summarySection,
        recentSection,
        evidenceSection,
      ],
      this.config.maxContextChars,
    );

    return {
      timeZone: options.timeZone,
      nowIso: now.toISOString(),
      localDate,
      dateIntent,
      conversationId: options.conversationId,
      userMessageId: options.userMessageId,
      promptText,
      evidence: options.registry.list(),
      recentMessageCount: recent.length,
      historicalMessageCount: historicalMessages.length,
      factCount: facts.length,
      researchSnapshotCount: researchSnapshots.length,
    };
  }
}
