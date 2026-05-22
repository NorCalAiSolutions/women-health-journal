import { createHash } from "node:crypto";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import pg from "pg";

const { Pool } = pg;
const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const migrationsDir = path.join(rootDir, "database", "migrations");

loadDotEnv(path.join(rootDir, ".env"));

const databaseUrl = process.env.DATABASE_URL;
const schema = process.env.DATABASE_SCHEMA ?? "whjournal";

if (!databaseUrl) {
  console.error("DATABASE_URL is required. Add it to .env before running migrations.");
  process.exit(1);
}

if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(schema)) {
  console.error("DATABASE_SCHEMA must be a valid PostgreSQL identifier.");
  process.exit(1);
}

const migrationFiles = readdirSync(migrationsDir)
  .filter((file) => file.endsWith(".sql"))
  .sort((left, right) => left.localeCompare(right));

if (!migrationFiles.length) {
  console.log("No SQL migrations found.");
  process.exit(0);
}

const pool = new Pool({ connectionString: databaseUrl });

try {
  await ensureMigrationTable();
  const applied = await loadAppliedMigrations();

  let appliedCount = 0;
  for (const filename of migrationFiles) {
    const sql = readFileSync(path.join(migrationsDir, filename), "utf8");
    const checksum = sha256(sql);
    const existing = applied.get(filename);

    if (existing) {
      if (existing !== checksum) {
        throw new Error(
          `Migration checksum changed for ${filename}. Existing=${existing}, current=${checksum}. Create a new migration instead of editing an applied one.`
        );
      }
      console.log(`skip ${filename}`);
      continue;
    }

    await runMigration(filename, sql, checksum);
    appliedCount += 1;
  }

  console.log(appliedCount ? `Applied ${appliedCount} migration(s).` : "Database is already up to date.");
} finally {
  await pool.end();
}

async function ensureMigrationTable() {
  await pool.query(`CREATE SCHEMA IF NOT EXISTS "${schema}"`);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS "${schema}"."schema_migrations" (
      filename text PRIMARY KEY,
      checksum text NOT NULL,
      applied_at timestamptz NOT NULL DEFAULT now()
    )
  `);
}

async function loadAppliedMigrations() {
  const result = await pool.query(`SELECT filename, checksum FROM "${schema}"."schema_migrations"`);
  return new Map(result.rows.map((row) => [row.filename, row.checksum]));
}

async function runMigration(filename, sql, checksum) {
  const client = await pool.connect();
  try {
    console.log(`apply ${filename}`);
    await client.query("BEGIN");
    await client.query(sql);
    await client.query(
      `INSERT INTO "${schema}"."schema_migrations" (filename, checksum) VALUES ($1, $2)`,
      [filename, checksum]
    );
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function loadDotEnv(filePath) {
  if (!existsSync(filePath)) return;

  const lines = readFileSync(filePath, "utf8").split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;

    const separatorIndex = trimmed.indexOf("=");
    if (separatorIndex === -1) continue;

    const key = trimmed.slice(0, separatorIndex).trim();
    const rawValue = trimmed.slice(separatorIndex + 1).trim();
    if (!key || process.env[key] !== undefined) continue;

    process.env[key] = unquote(rawValue);
  }
}

function unquote(value) {
  if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
    return value.slice(1, -1);
  }
  return value;
}
