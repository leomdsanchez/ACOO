export abstract class AgentRegistryError extends Error {
  public abstract readonly statusCode: number;
}

export class AgentRegistryValidationError extends AgentRegistryError {
  public readonly statusCode = 400;

  public constructor(message: string) {
    super(message);
    this.name = "AgentRegistryValidationError";
  }
}

export class AgentRegistryNotFoundError extends AgentRegistryError {
  public readonly statusCode = 404;

  public constructor(message: string) {
    super(message);
    this.name = "AgentRegistryNotFoundError";
  }
}

export class AgentRegistryConflictError extends AgentRegistryError {
  public readonly statusCode = 409;

  public constructor(message: string) {
    super(message);
    this.name = "AgentRegistryConflictError";
  }
}
