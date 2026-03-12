import type { AgentController, AgentRequest, AgentResponse } from "../controller/AgentController.js";

export class OperationalBot {
  public constructor(private readonly controller: AgentController) {}

  public handleMessage(request: AgentRequest): Promise<AgentResponse> {
    return this.controller.handle(request);
  }

  public handleTextMessage(request: AgentRequest): Promise<AgentResponse> {
    return this.handleMessage(request);
  }
}
