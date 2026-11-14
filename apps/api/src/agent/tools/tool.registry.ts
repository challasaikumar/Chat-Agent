import { agentToolError } from "../errors/agent.errors.js";
import type { AgentTool } from "./tool.interface.js";

export class ToolRegistry {
  private readonly tools = new Map<string, AgentTool>();

  register(tool: AgentTool): void {
    this.tools.set(tool.name, tool);
  }

  get(name: string): AgentTool {
    const tool = this.tools.get(name);
    if (!tool) {
      throw agentToolError(`Unknown function: ${name}`);
    }
    return tool;
  }

  has(name: string): boolean {
    return this.tools.has(name);
  }
}
