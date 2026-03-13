import path from "node:path";
import { PrismaClient } from "@prisma/client";

const prismaClients = new Map<string, PrismaClient>();

export function getPrismaClient(repoRoot: string): PrismaClient {
  const normalizedRoot = path.resolve(repoRoot);
  const existing = prismaClients.get(normalizedRoot);
  if (existing) {
    return existing;
  }

  const databasePath = path.join(normalizedRoot, "data", "acoo.db");
  const client = new PrismaClient({
    datasources: {
      db: {
        url: `file:${databasePath}`,
      },
    },
    log: ["error", "warn"],
  });

  prismaClients.set(normalizedRoot, client);
  return client;
}
