import type { ToolRegistry } from "../../engine/ToolRegistry.js";

export interface McpCallResult {
  toolName: string;
  output: unknown;
}

export class OperationalMcpServer {
  public constructor(private readonly toolRegistry: ToolRegistry) {}

  public listTools() {
    return this.toolRegistry.listTools().map((tool) => ({
      name: tool.name,
      description: tool.description,
      inputSchema: tool.inputSchema,
    }));
  }

  public async callTool(toolName: string, input: unknown): Promise<McpCallResult> {
    const output = await this.toolRegistry.callTool(toolName, input);

    return {
      toolName,
      output,
    };
  }
}
