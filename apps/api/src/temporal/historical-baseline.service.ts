import { and, desc, eq, gte, lte, or, like } from "drizzle-orm";
import type { AppDatabase } from "../db/index.js";
import {
  messages,
  researchSnapshots,
  type Message,
  type ResearchSnapshot,
  type ResearchSource,
} from "../db/schema.js";
import { ResearchRepository } from "../repositories/research.repository.js";
import { FactRepository } from "../repositories/fact.repository.js";
import type { TemporalIntent } from "./temporal.types.js";
import type { TemporalConfig } from "./temporal.config.js";
import { EvidenceSelector } from "./evidence/evidence.selector.js";
import { TemporalWindowService } from "./intent/temporal-window.service.js";
import { dayBounds } from "./intent/temporal-date.utils.js";

export type HistoricalBaseline = {
  snapshots: ResearchSnapshot[];
  sources: ResearchSource[];
  messages: Message[];
  facts: Array<{ id: string; fact: string; confidence: number }>;
  preferredCapturedAt: Date | null;
  summary: string;
  confidenceNote: string;
};

export class HistoricalBaselineService {
  private readonly research: ResearchRepository;
  private readonly facts: FactRepository;
  private readonly selector = new EvidenceSelector();
  private readonly windows = new TemporalWindowService();

  constructor(
    private readonly db: AppDatabase,
    private readonly config: TemporalConfig,
  ) {
    this.research = new ResearchRepository(db);
    this.facts = new FactRepository(db);
  }

  async findBaseline(options: {
    userId: string;
    conversationId: string;
    intent: TemporalIntent;
    entityNames: string[];
  }): Promise<HistoricalBaseline> {
    const allSnapshots = await this.listUserSnapshots(options.userId, 100);
    const sameConversation = allSnapshots.filter(
      (s) => s.conversationId === options.conversationId,
    );

    let selected = this.selector.selectHistoricalSnapshots({
      snapshots: sameConversation.length > 0 ? sameConversation : allSnapshots,
      intent: options.intent,
      entityNames: options.entityNames.length
        ? options.entityNames
        : options.intent.comparisonTargets,
      max: this.config.maxHistoricalSnapshots,
    });

    // If date window set but nothing matched in-conversation, try cross-conversation
    if (selected.length === 0 && options.intent.startDate) {
      selected = this.selector.selectHistoricalSnapshots({
        snapshots: allSnapshots,
        intent: options.intent,
        entityNames: options.entityNames.length
          ? options.entityNames
          : options.intent.comparisonTargets,
        max: this.config.maxHistoricalSnapshots,
      });
    }

    // Fallback: most recent same-conversation research that mentions targets
    if (selected.length === 0 && sameConversation.length > 0) {
      selected = sameConversation.slice(0, this.config.maxHistoricalSnapshots);
    }

    const sources: ResearchSource[] = [];
    for (const snapshot of selected) {
      sources.push(...await this.research.listSourcesForSnapshot(snapshot.id));
    }

    const historicalMessages = await this.findMessages(options);
    const facts = (await this.facts
      .listForUser(options.userId, { limit: 20, activeOnly: true }))
      .filter((fact) => {
        if (options.entityNames.length === 0) {
          return /price|pricing|plan|hosting|crm/i.test(fact.fact);
        }
        return options.entityNames.some((name) =>
          fact.fact.toLowerCase().includes(name.toLowerCase()),
        );
      })
      .map((fact) => ({
        id: fact.id,
        fact: fact.fact,
        confidence: fact.confidence,
      }));

    const preferredCapturedAt = selected[0]?.capturedAt ?? null;
    const hasSourcedEvidence = sources.length > 0;
    const confidenceNote = hasSourcedEvidence
      ? "Baseline includes persisted research sources with observation timestamps."
      : historicalMessages.length > 0
        ? "Baseline relies on conversation text without independent source attribution (lower confidence)."
        : "No historical baseline evidence was found.";

    const summary = [
      `Historical snapshots: ${selected.length}.`,
      `Sources: ${sources.length}.`,
      preferredCapturedAt
        ? `Preferred captured_at: ${preferredCapturedAt.toISOString()}.`
        : "No snapshot captured_at available.",
      options.intent.startDate
        ? `Reference window: ${options.intent.startDate}${options.intent.endDate && options.intent.endDate !== options.intent.startDate ? ` → ${options.intent.endDate}` : ""}.`
        : "Reference window unresolved.",
      confidenceNote,
    ].join(" ");

    void this.windows;
    void or;
    void like;

    return {
      snapshots: selected,
      sources,
      messages: historicalMessages,
      facts,
      preferredCapturedAt,
      summary,
      confidenceNote,
    };
  }

  private async listUserSnapshots(userId: string, limit: number): Promise<ResearchSnapshot[]> {
    return await this.db
      .select()
      .from(researchSnapshots)
      .where(eq(researchSnapshots.userId, userId))
      .orderBy(desc(researchSnapshots.capturedAt))
      .limit(limit);
  }

  private async findMessages(options: {
    userId: string;
    conversationId: string;
    intent: TemporalIntent;
  }): Promise<Message[]> {
    if (!options.intent.startDate) {
      return [];
    }
    const bounds = dayBounds(
      options.intent.startDate,
      options.intent.timeZone,
    );
    const end = options.intent.endDate
      ? dayBounds(options.intent.endDate, options.intent.timeZone).end
      : bounds.end;

    return await this.db
      .select()
      .from(messages)
      .where(
        and(
          eq(messages.conversationId, options.conversationId),
          gte(messages.createdAt, bounds.start),
          lte(messages.createdAt, end),
        ),
      )
      .orderBy(messages.createdAt);
  }
}
