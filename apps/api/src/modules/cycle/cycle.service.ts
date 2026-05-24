import { BadRequestException, Injectable } from "@nestjs/common";
import { PDFParse } from "pdf-parse";
import { CryptoService } from "../../common/crypto.service";
import { DatabaseService } from "../../common/database.service";

type CycleImportRow = {
  id: string;
  source_type: "txt" | "csv" | "pdf";
  source_label: string;
  normalized_json: CycleNormalizedSummary;
  confidence: number;
  ignored_identifiers_json: string[];
  created_at: Date;
};

type CycleNormalizedSummary = {
  source: "cycle_summary_import";
  periodStarts: string[];
  periodEnds: string[];
  cycleLengthsDays: number[];
  averageCycleLengthDays: number | null;
  cycleLengthRangeDays: [number, number] | null;
  flowNotes: string[];
  symptomNotes: string[];
  importedRows: number;
  confidence: number;
  limitations: string[];
};

@Injectable()
export class CycleService {
  constructor(
    private readonly db: DatabaseService,
    private readonly crypto: CryptoService
  ) {}

  async importFile(userId: string, file: Express.Multer.File) {
    const sourceType = sourceTypeFromFile(file);
    const rawText = await extractText(file, sourceType);
    const scrubbed = scrubIdentifiers(rawText);
    const normalized = normalizeCycleSummary(scrubbed.text);
    const encrypted = this.crypto.encrypt(scrubbed.text);

    const result = await this.db.query<CycleImportRow>(
      `INSERT INTO ${this.db.table("cycle_imports")}
        (id, user_id, source_type, source_label, sanitized_text_ciphertext, sanitized_text_nonce, normalized_json, confidence, ignored_identifiers_json)
       VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, $8, $9::jsonb)
       RETURNING id, source_type, source_label, normalized_json, confidence, ignored_identifiers_json, created_at`,
      [
        this.db.id(),
        userId,
        sourceType,
        safeFilename(file.originalname),
        encrypted.ciphertext,
        encrypted.nonce,
        JSON.stringify(normalized),
        normalized.confidence,
        JSON.stringify(scrubbed.ignoredIdentifiers)
      ]
    );

    return formatCycleImport(result.rows[0]);
  }

  async summary(userId: string) {
    const result = await this.db.query<CycleImportRow>(
      `SELECT id, source_type, source_label, normalized_json, confidence, ignored_identifiers_json, created_at
       FROM ${this.db.table("cycle_imports")}
       WHERE user_id = $1
       ORDER BY created_at DESC
       LIMIT 1`,
      [userId]
    );

    return {
      latest: result.rows[0] ? formatCycleImport(result.rows[0]) : null
    };
  }
}

async function extractText(file: Express.Multer.File, sourceType: "txt" | "csv" | "pdf") {
  if (!file.buffer?.length) {
    throw new BadRequestException("The uploaded file was empty.");
  }

  if (sourceType === "pdf") {
    const parser = new PDFParse({ data: file.buffer });
    try {
      const parsed = await parser.getText();
      const text = parsed.text.trim();
      if (!text) {
        throw new BadRequestException("Could not read text from this PDF. Try exporting the cycle summary as TXT or CSV.");
      }
      return text;
    } finally {
      await parser.destroy();
    }
  }

  return file.buffer.toString("utf8");
}

function normalizeCycleSummary(text: string): CycleNormalizedSummary {
  const lines = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  const periodStarts = new Set<string>();
  const periodEnds = new Set<string>();
  const cycleLengthsDays: number[] = [];
  const flowNotes = new Set<string>();
  const symptomNotes = new Set<string>();

  for (const line of lines) {
    const lower = line.toLowerCase();
    const dates = extractDates(line);
    if (/(period|menstruation|menses|cycle).*(start|began|begin|from)|^(start|period start)/i.test(line)) {
      dates.forEach((date) => periodStarts.add(date));
    }
    if (/(period|menstruation|menses).*(end|ended|to)|^(end|period end)/i.test(line)) {
      dates.forEach((date) => periodEnds.add(date));
    }
    if (/(cycle length|length|cycle).*(day|days)/i.test(line)) {
      for (const value of line.matchAll(/(\d{1,3}(?:\.\d+)?)\s*days?/gi)) {
        const days = Number(value[1]);
        if (Number.isFinite(days) && days >= 10 && days <= 120) {
          cycleLengthsDays.push(days);
        }
      }
    }
    if (/flow|spotting|light|medium|heavy/i.test(line)) {
      flowNotes.add(compactLine(line));
    }
    if (/cramp|pms|acne|headache|migraine|fatigue|mood|pain|bloat|nausea/i.test(line)) {
      symptomNotes.add(compactLine(line));
    }
  }

  const sortedStarts = Array.from(periodStarts).sort();
  const inferredLengths = inferCycleLengths(sortedStarts);
  const allCycleLengths = cycleLengthsDays.length ? cycleLengthsDays : inferredLengths;
  const averageCycleLengthDays = average(allCycleLengths);
  const cycleLengthRangeDays = allCycleLengths.length
    ? [Math.min(...allCycleLengths), Math.max(...allCycleLengths)] as [number, number]
    : null;
  const confidence = confidenceForImport(sortedStarts.length, allCycleLengths.length, lines.length);

  return {
    source: "cycle_summary_import",
    periodStarts: sortedStarts,
    periodEnds: Array.from(periodEnds).sort(),
    cycleLengthsDays: allCycleLengths,
    averageCycleLengthDays,
    cycleLengthRangeDays,
    flowNotes: Array.from(flowNotes).slice(0, 12),
    symptomNotes: Array.from(symptomNotes).slice(0, 12),
    importedRows: lines.length,
    confidence,
    limitations: [
      "Imported summaries may be incomplete or use different tracking definitions.",
      "Identifying fields were ignored before storage.",
      "This cycle summary is informational only and cannot diagnose cycle or hormone conditions."
    ]
  };
}

function scrubIdentifiers(text: string) {
  const ignored = new Set<string>();
  const scrubbedLines = text.split(/\r?\n/).filter((line) => {
    const lower = line.toLowerCase();
    const isIdentifier =
      /\b(name|dob|date of birth|birth date|age|email|phone|address|apple id|medical record|mrn|patient id|member id|device id)\b/.test(lower) ||
      /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i.test(line) ||
      /\b\d{3}[-.\s]?\d{3}[-.\s]?\d{4}\b/.test(line);
    if (isIdentifier) {
      ignored.add(identifierKind(line));
      return false;
    }
    return true;
  });

  return {
    text: scrubbedLines.join("\n").trim(),
    ignoredIdentifiers: Array.from(ignored)
  };
}

function extractDates(value: string) {
  const dates = new Set<string>();
  for (const match of value.matchAll(/\b(\d{4})[-/](\d{1,2})[-/](\d{1,2})\b/g)) {
    dates.add(formatDate(Number(match[1]), Number(match[2]), Number(match[3])));
  }
  for (const match of value.matchAll(/\b(\d{1,2})[-/](\d{1,2})[-/](\d{2,4})\b/g)) {
    const year = Number(match[3].length === 2 ? `20${match[3]}` : match[3]);
    dates.add(formatDate(year, Number(match[1]), Number(match[2])));
  }
  for (const match of value.matchAll(/\b(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Sept|Oct|Nov|Dec)[a-z]*\.?\s+(\d{1,2}),?\s+(\d{4})\b/gi)) {
    dates.add(formatDate(Number(match[3]), monthNumber(match[1]), Number(match[2])));
  }
  return Array.from(dates).filter(Boolean);
}

function inferCycleLengths(starts: string[]) {
  const lengths: number[] = [];
  for (let index = 1; index < starts.length; index += 1) {
    const previous = new Date(`${starts[index - 1]}T00:00:00Z`).getTime();
    const current = new Date(`${starts[index]}T00:00:00Z`).getTime();
    const days = Math.round((current - previous) / 86_400_000);
    if (days >= 10 && days <= 120) {
      lengths.push(days);
    }
  }
  return lengths;
}

function sourceTypeFromFile(file: Express.Multer.File): "txt" | "csv" | "pdf" {
  if (/\.pdf$/i.test(file.originalname) || file.mimetype === "application/pdf") return "pdf";
  if (/\.csv$/i.test(file.originalname) || /csv/.test(file.mimetype)) return "csv";
  if (/\.txt$/i.test(file.originalname) || file.mimetype.startsWith("text/")) return "txt";
  throw new BadRequestException("Upload a TXT, CSV, or PDF cycle summary.");
}

function formatDate(year: number, month: number, day: number) {
  const date = new Date(Date.UTC(year, month - 1, day));
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return "";
  return date.toISOString().slice(0, 10);
}

function monthNumber(value: string) {
  return ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"].indexOf(value.slice(0, 3).toLowerCase()) + 1;
}

function average(values: number[]) {
  if (!values.length) return null;
  return Number((values.reduce((sum, value) => sum + value, 0) / values.length).toFixed(1));
}

function confidenceForImport(periodStartCount: number, cycleLengthCount: number, lineCount: number) {
  const score = 0.3 + Math.min(periodStartCount, 6) * 0.06 + Math.min(cycleLengthCount, 6) * 0.04 + Math.min(lineCount, 20) * 0.005;
  return Number(Math.min(0.86, score).toFixed(2));
}

function compactLine(value: string) {
  return value.replace(/\s+/g, " ").slice(0, 180);
}

function safeFilename(value: string) {
  return value.replace(/[^\w.\- ]/g, "").slice(0, 120) || "cycle-summary";
}

function identifierKind(line: string) {
  const lower = line.toLowerCase();
  if (lower.includes("dob") || lower.includes("birth")) return "date_of_birth";
  if (lower.includes("name")) return "name";
  if (lower.includes("age")) return "age";
  if (lower.includes("email") || line.includes("@")) return "email";
  if (lower.includes("phone") || /\d{3}[-.\s]?\d{3}[-.\s]?\d{4}/.test(line)) return "phone";
  if (lower.includes("address")) return "address";
  if (lower.includes("medical record") || lower.includes("mrn") || lower.includes("patient id") || lower.includes("member id")) return "medical_identifier";
  if (lower.includes("apple id") || lower.includes("device id")) return "device_or_account_identifier";
  return "identifier";
}

function formatCycleImport(row: CycleImportRow) {
  return {
    id: row.id,
    sourceType: row.source_type,
    sourceLabel: row.source_label,
    normalized: row.normalized_json,
    confidence: row.confidence,
    ignoredIdentifiers: row.ignored_identifiers_json,
    createdAt: row.created_at
  };
}
