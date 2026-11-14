import { and, desc, eq } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import type { AppDatabase } from "../db/index.js";
import {
  agentRuns,
  messageToolCalls,
  messages,
  type AgentRun,
} from "../db/schema.js";

export class AgentRunRepository {
  constructor(private readonly db: AppDatabase) {}

  async create(input: {
    userId: string;
    conversationId: string;
    model: string;
    userMessageId?: number | null;
    clientRequestId?: string | null;
  }): Promise<AgentRun> {
    const id = randomUUID();
    const now = new Date();
    await this.db
      .insert(agentRuns)
      .values({
        id,
        userId: input.userId,
        conversationId: input.conversationId,
        userMessageId: input.userMessageId ?? null,
        assistantMessageId: null,
        model: input.model,
        status: "running",
        clientRequestId: input.clientRequestId ?? null,
        toolCallCount: 0,
        searchCallCount: 0,
        inputTokens: null,
        outputTokens: null,
        startedAt: now,
        completedAt: null,
        durationMs: null,
        errorCategory: null,
        errorMessage: null,
        createdAt: now,
      });

    return (await this.findByIdForUser(id, input.userId))!;
  }

  async findByClientRequestId(
    userId: string,
    clientRequestId: string,
  ): Promise<AgentRun | undefined> {
    return (await this.db
      .select()
      .from(agentRuns)
      .where(
        and(
          eq(agentRuns.userId, userId),
          eq(agentRuns.clientRequestId, clientRequestId),
        ),
      ).limit(1))[0];
  }

  async findByIdForUser(id: string, userId: string): Promise<AgentRun | undefined> {
    return (await this.db
      .select()
      .from(agentRuns)
      .where(and(eq(agentRuns.id, id), eq(agentRuns.userId, userId))).limit(1))[0];
  }

  async update(
    id: string,
    patch: Partial<{
      status: AgentRun["status"];
      userMessageId: number | null;
      assistantMessageId: number | null;
      toolCallCount: number;
      searchCallCount: number;
      inputTokens: number | null;
      outputTokens: number | null;
      completedAt: Date | null;
      durationMs: number | null;
      errorCategory: string | null;
      errorMessage: string | null;
    }>,
  ): Promise<AgentRun | undefined> {
    await this.db.update(agentRuns).set(patch).where(eq(agentRuns.id, id));
    return (await this.db.select().from(agentRuns).where(eq(agentRuns.id, id)).limit(1))[0];
  }

  async listToolCallsForConversation(conversationId: string, sinceMessageId: number) {
    return (await this.db
      .select({
        id: messageToolCalls.id,
        toolName: messageToolCalls.toolName,
        status: messageToolCalls.status,
        arguments: messageToolCalls.arguments,
        result: messageToolCalls.result,
        createdAt: messageToolCalls.createdAt,
        updatedAt: messageToolCalls.updatedAt,
        messageId: messageToolCalls.messageId,
      })
      .from(messageToolCalls)
      .innerJoin(messages, eq(messageToolCalls.messageId, messages.id))
      .where(eq(messages.conversationId, conversationId))
      .orderBy(desc(messageToolCalls.createdAt)))
      .filter((row) => row.messageId >= sinceMessageId);
  }
}
