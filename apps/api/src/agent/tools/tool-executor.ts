import { randomUUID } from "node:crypto";
import type { AppDatabase } from "../../db/index.js";
import { messageToolCalls } from "../../db/schema.js";
import { MessageRepository } from "../../repositories/message.repository.js";
import { eq } from "drizzle-orm";
import type { ToolRegistry } from "./tool.registry.js";
import type { ToolExecutionContext } from "./tool.interface.js";
import type { ExecutionBudget } from "../utils/execution-budget.js";
import { agentToolError } from "../errors/agent.errors.js";

export class ToolExecutor {
  private readonly messages: MessageRepository;

  constructor(
    private readonly db: AppDatabase,
    private readonly registry: ToolRegistry,
    private readonly budget: ExecutionBudget,
  ) {
    this.messages = new MessageRepository(db);
  }

  async executeFunctionCall(options: {
    conversationId: string;
    callId: string;
    name: string;
    argumentsJson: string;
    context: ToolExecutionContext;
  }): Promise<{
    toolCallRecordId: string;
    output: Record<string, unknown>;
    searchExecuted: boolean;
  }> {
    this.budget.assertNotTimedOut();
    if (!this.budget.canCallTool()) {
      throw agentToolError("Maximum tool iterations reached");
    }
    this.budget.recordToolIteration();

    const assistantMessage = await this.messages.insert({
      conversationId: options.conversationId,
      role: "assistant",
      content: `Calling tool ${options.name}`,
      metadata: {
        type: "tool_call",
        callId: options.callId,
        toolName: options.name,
        arguments: options.argumentsJson,
      },
    });

    const toolCallId = randomUUID();
    const now = new Date();
    await this.db
      .insert(messageToolCalls)
      .values({
        id: toolCallId,
        messageId: assistantMessage.id,
        toolName: options.name,
        arguments: safeParseObject(options.argumentsJson),
        result: null,
        status: "running",
        createdAt: now,
        updatedAt: now,
      });

    try {
      const tool = this.registry.get(options.name);
      const result = await tool.execute(options.argumentsJson, options.context);

      await this.db
        .update(messageToolCalls)
        .set({
          result: result.output,
          status: result.success ? "completed" : "failed",
          updatedAt: new Date(),
        })
        .where(eq(messageToolCalls.id, toolCallId));

      await this.messages.insert({
        conversationId: options.conversationId,
        role: "tool",
        content: JSON.stringify(result.output).slice(0, 20_000),
        metadata: {
          type: "tool_result",
          callId: options.callId,
          toolName: options.name,
          toolCallRecordId: toolCallId,
          success: result.success,
        },
      });

      return {
        toolCallRecordId: toolCallId,
        output: result.output,
        searchExecuted: result.searchExecuted,
      };
    } catch (error) {
      await this.db
        .update(messageToolCalls)
        .set({
          result: {
            success: false,
            error: error instanceof Error ? error.message : "tool failed",
          },
          status: "failed",
          updatedAt: new Date(),
        })
        .where(eq(messageToolCalls.id, toolCallId));
      throw error;
    }
  }
}

function safeParseObject(raw: string): Record<string, unknown> {
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>;
    }
  } catch {
    // ignore
  }
  return { raw };
}
