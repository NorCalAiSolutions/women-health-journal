import { randomUUID } from "node:crypto";
import { Injectable, OnModuleDestroy } from "@nestjs/common";
import { Pool, QueryResultRow } from "pg";

@Injectable()
export class DatabaseService implements OnModuleDestroy {
  private readonly pool = new Pool({
    connectionString: process.env.DATABASE_URL
  });

  readonly schema = process.env.DATABASE_SCHEMA ?? "whjournal";

  constructor() {
    if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(this.schema)) {
      throw new Error("DATABASE_SCHEMA must be a valid PostgreSQL identifier");
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
