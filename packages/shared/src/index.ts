import { z } from "zod";

export const SeveritySchema = z.enum(["low", "moderate", "high", "urgent"]);
export const TrendSchema = z.enum(["decreasing", "stable", "increasing", "insufficient_data"]);

export const StructuredEntrySchema = z.object({
  weight: z.number().positive().optional(),
  sleepHours: z.number().min(0).max(24).optional(),
  energy: z.number().int().min(1).max(10).optional(),
  appetite: z.enum(["low", "normal", "high", "variable"]).optional(),
  exerciseMinutes: z.number().int().min(0).max(1440).optional(),
  hydrationCups: z.number().min(0).max(40).optional(),
  temperatureF: z.number().min(90).max(110).optional(),
  periodStarted: z.boolean().optional(),
  periodEnded: z.boolean().optional(),
  flow: z.enum(["none", "spotting", "light", "medium", "heavy"]).optional(),
  cramping: z.number().int().min(0).max(10).optional(),
  pmsSymptoms: z.array(z.string()).default([]),
  mood: z.enum(["very_low", "low", "neutral", "good", "great", "mixed"]).optional(),
  anxiety: z.number().int().min(0).max(10).optional(),
  stress: z.number().int().min(0).max(10).optional(),
  focus: z.number().int().min(0).max(10).optional(),
  symptoms: z.array(z.string()).default([]),
  medications: z.array(z.string()).default([]),
  supplements: z.array(z.string()).default([])
});

export const JournalCreateSchema = z.object({
  occurredAt: z.string().datetime().optional(),
  rawText: z.string().min(1).max(12000),
  structured: StructuredEntrySchema.partial().optional(),
  consentToAiAnalysis: z.boolean()
});

export const EvidenceSchema = z.object({
  source: z.enum(["journal_text", "structured_field", "history", "rule"]),
  quote: z.string().optional(),
  field: z.string().optional(),
  value: z.union([z.string(), z.number(), z.boolean()]).optional(),
  occurredAt: z.string().optional()
});

export const ExtractedObservationSchema = z.object({
  fatigue: z.boolean().default(false),
  cycleIrregularity: z.boolean().default(false),
  acne: z.boolean().default(false),
  pain: z.boolean().default(false),
  headache: z.boolean().default(false),
  digestiveIssues: z.boolean().default(false),
  libidoChange: z.boolean().default(false),
  sleepHours: z.number().min(0).max(24).nullable(),
  stress: z.enum(["none", "low", "moderate", "high"]).nullable(),
  mood: z.string().nullable(),
  redFlagSignals: z.array(z.string()).default([]),
  normalizedSymptoms: z.array(z.string()).default([]),
  confidence: z.number().min(0).max(1),
  evidence: z.array(EvidenceSchema),
  limitations: z.array(z.string())
});

export const PatternResultSchema = z.object({
  name: z.string(),
  windowDays: z.number().int(),
  trend: TrendSchema,
  confidence: z.number().min(0).max(1),
  severity: SeveritySchema,
  evidence: z.array(EvidenceSchema),
  limitations: z.array(z.string())
});

export const InsightSchema = z.object({
  summary: z.string(),
  observedChanges: z.array(z.string()),
  possibleWellnessConsiderations: z.array(z.string()),
  questionsToReflectOn: z.array(z.string()),
  suggestedProfessionalFollowUp: z.array(z.string()),
  confidence: z.number().min(0).max(1),
  evidence: z.array(EvidenceSchema),
  limitations: z.array(z.string())
});

export type StructuredEntry = z.infer<typeof StructuredEntrySchema>;
export type JournalCreateInput = z.infer<typeof JournalCreateSchema>;
export type ExtractedObservation = z.infer<typeof ExtractedObservationSchema>;
export type PatternResult = z.infer<typeof PatternResultSchema>;
export type Insight = z.infer<typeof InsightSchema>;
