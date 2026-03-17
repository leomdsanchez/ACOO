export class ManagedRuntimeUnavailableError extends Error {
  public readonly publicMessage: string;
  public readonly runtimeNames: string[];

  public constructor(message: string, publicMessage: string, runtimeNames: string[] = []) {
    super(message);
    this.name = "ManagedRuntimeUnavailableError";
    this.publicMessage = publicMessage;
    this.runtimeNames = [...new Set(runtimeNames)].sort();
  }
}
