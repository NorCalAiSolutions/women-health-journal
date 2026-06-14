import { randomUUID } from "node:crypto";
import { Injectable, OnModuleDestroy } from "@nestjs/common";
import { Pool, QueryResultRow } from "pg";

@Injectable()
export class DatabaseService implements OnModuleDestroy {
  readonly schema = process.env.DATABASE_SCHEMA ?? "whjournal";

  private readonly pool = new Pool({
    connectionString: this.getConnectionString()
  });

  constructor() {
    if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(this.schema)) {
      throw new Error("DATABASE_SCHEMA must be a valid PostgreSQL identifier");
    }
  }
  private getConnectionString() {
    const connectionString = process.env.norcalaidb_DATABASE_URL ?? process.env.DATABASE_URL;

    if (!connectionString) {
      throw new Error("DATABASE_URL is required");
    }

    try {
      const url = new URL(connectionString);
      if (!url.searchParams.has("sslmode")) {
        const isLocal = ["localhost", "127.0.0.1", "::1"].includes(url.hostname);
        url.searchParams.set("sslmode", isLocal ? "disable" : "verify-full");
      }
      return url.toString();
    } catch {
      return connectionString;
    }
  }

  async query<T extends QueryResultRow = QueryResultRow>(text: string, params: unknown[] = []) {
    return this.pool.query<T>(text, params);
  }

  async onModuleDestroy() {
    await this.pool.end();
  }

  id() {
    return randomUUID();
  }

  table(name: string) {
    if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(name)) {
      throw new Error("Table name must be a valid PostgreSQL identifier");
    }
    return `"${this.schema}"."${name}"`;
  }
}
