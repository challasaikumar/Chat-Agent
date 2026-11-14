export type ToolExecutionContext = {
  userId: string;
  conversationId: string;
  requestId?: string;
};

export type ToolExecutionResult = {
  success: boolean;
  output: Record<string, unknown>;
  searchExecuted: boolean;
};

export interface AgentTool {
  readonly name: string;
  execute(
    rawArguments: string,
    context: ToolExecutionContext,
  ): Promise<ToolExecutionResult>;
}
