import type { McpToolDefinition } from "../mcp/tools.js";

export class ToolRegistry {
  private readonly tools = new Map<string, McpToolDefinition<unknown, unknown>>();

  public constructor(toolCatalog: Array<McpToolDefinition<unknown, unknown>>) {
    for (const tool of toolCatalog) {
      this.tools.set(tool.name, tool);
    }
  }

  public listTools(): Array<McpToolDefinition<unknown, unknown>> {
    return [...this.tools.values()];
  }

  public getTool(name: string): McpToolDefinition<unknown, unknown> | null {
    return this.tools.get(name) ?? null;
  }

  public async callTool(name: string, input: unknown): Promise<unknown> {
    const tool = this.getTool(name);
    if (!tool) {
      throw new Error(`Tool "${name}" is not registered.`);
    }

    return tool.run(input);
  }
}
