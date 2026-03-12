export interface ParsedFlagArgs {
  flags: Set<string>;
  values: Map<string, string>;
  positionals: string[];
}

export function parseFlagArgs(argv: string[]): ParsedFlagArgs {
  const flags = new Set<string>();
  const values = new Map<string, string>();
  const positionals: string[] = [];

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];

    if (!token.startsWith("--")) {
      positionals.push(token);
      continue;
    }

    const next = argv[index + 1];
    if (!next || next.startsWith("--")) {
      flags.add(token);
      continue;
    }

    values.set(token, next);
    index += 1;
  }

  return {
    flags,
    positionals,
    values,
  };
}
