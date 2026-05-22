import { Injectable, Logger } from "@nestjs/common";
import OpenAI from "openai";
import { zodTextFormat } from "openai/helpers/zod";
import {
  ExtractedObservation,
  ExtractedObservationSchema,
  Insight,
  InsightSchema,
  StructuredEntry
} from "@whjc/shared";
import { INSIGHT_SYSTEM_PROMPT, JOURNAL_EXTRACTION_SYSTEM_PROMPT } from "./prompts";

export type JournalAnalysisResult = {
  observation: ExtractedObservation;
  analysisSource: "openai_llm" | "local_fallback";
  model: string;
};

@Injectable()
export class AiService {
  private readonly logger = new Logger(AiService.name);
  private readonly model = process.env.OPENAI_MODEL ?? "gpt-4.1-mini";
  private client?: OpenAI;

  async extractJournal(rawText: string, structured?: Partial<StructuredEntry>): Promise<JournalAnalysisResult> {
    if (!process.env.OPENAI_API_KEY) {
      return {
        observation: this.localFallbackExtraction(rawText, structured),
        analysisSource: "local_fallback",
        model: "local-fallback"
      };
    }

    try {
      const response = await this.openai().responses.parse({
        model: this.model,
        input: [
          { role: "system", content: JOURNAL_EXTRACTION_SYSTEM_PROMPT },
          {
            role: "user",
            content: JSON.stringify({ rawText, structured: structured ?? {} })
          }
        ],
        text: { format: zodTextFormat(ExtractedObservationSchema, "journal_extraction") }
      });

      return {
        observation: ExtractedObservationSchema.parse(response.output_parsed),
        analysisSource: "openai_llm",
        model: this.model
      };
    } catch (error) {
      this.logger.warn(`OpenAI journal extraction failed; using local fallback. ${this.errorSummary(error)}`);
      return {
        observation: {
          ...this.localFallbackExtraction(rawText, structured),
          limitations: [
            "OpenAI analysis was unavailable for this entry, so local keyword extraction was used.",
            "Fallback keyword extraction is less reliable than model-based structured extraction."
          ]
        },
        analysisSource: "local_fallback",
        model: "local-fallback"
      };
    }
  }

  async generateInsight(history: unknown): Promise<Insight> {
    if (!process.env.OPENAI_API_KEY) {
      return {
        summary: "Recent entries show wellness signals worth tracking over time.",
        observedChanges: ["AI insight generation is using local fallback mode because no OpenAI API key is configured."],
        possibleWellnessConsiderations: ["Review persistent or worsening patterns with a qualified healthcare professional."],
        questionsToReflectOn: ["What changed on days when symptoms felt more noticeable?"],
        suggestedProfessionalFollowUp: ["Bring this journal history to a clinician if concerns persist or intensify."],
        confidence: 0.35,
        evidence: [{ source: "history", field: "fallback", value: "no_openai_api_key" }],
        limitations: ["Fallback mode does not perform semantic analysis."]
      };
    }

    const response = await this.openai().responses.parse({
      model: this.model,
      input: [
        { role: "system", content: INSIGHT_SYSTEM_PROMPT },
        { role: "user", content: JSON.stringify(history) }
      ],
      text: { format: zodTextFormat(InsightSchema, "wellness_insight") }
    });

    return InsightSchema.parse(response.output_parsed);
  }

  private openai() {
    if (!this.client) {
      this.client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    }
    return this.client;
  }

  private errorSummary(error: unknown) {
    if (!error || typeof error !== "object") {
      return "Unknown error.";
    }
    const details = error as { status?: unknown; code?: unknown; message?: unknown };
    const status = details.status ? `status=${details.status}` : "";
    const code = details.code ? `code=${details.code}` : "";
    const message = typeof details.message === "string" ? details.message : "";
    return [status, code, message].filter(Boolean).join(" ");
  }

  private localFallbackExtraction(rawText: string, structured?: Partial<StructuredEntry>): ExtractedObservation {
    const text = rawText.toLowerCase();
    const has = (terms: string[]) => terms.some((term) => text.includes(term));
    const sleep = structured?.sleepHours ?? Number(text.match(/(\d+(?:\.\d+)?)\s*(hours|hrs)/)?.[1] ?? NaN);
    const evidence = [{ source: "journal_text" as const, quote: rawText.slice(0, 220) }];

    const observationFlags = {
      fatigue: has(["exhausted", "fatigue", "tired", "drained"]),
      cycleIrregularity: has(["late on my period", "missed period", "irregular", "spotting"]),
      acne: has(["acne", "breakout", "pimples"]),
      pain: has(["pain", "ache", "cramp"]),
      headache: has(["headache", "migraine"]),
      digestiveIssues: has(["bloating", "nausea", "diarrhea", "constipation"]),
      libidoChange: has(["libido", "sex drive"])
    };

    return {
      ...observationFlags,
      sleepHours: Number.isFinite(sleep) ? sleep : null,
      stress: has(["panic", "overwhelmed", "stressed"]) ? "high" : has(["anxious", "stress"]) ? "moderate" : null,
      mood: has(["sad", "hopeless"]) ? "low" : has(["anxious"]) ? "anxious" : null,
      redFlagSignals: this.detectLocalRedFlags(text),
      normalizedSymptoms: Object.entries(observationFlags)
        .filter(([, active]) => active)
        .map(([key]) => key),
      confidence: 0.45,
      evidence,
      limitations: ["Fallback keyword extraction is less reliable than model-based structured extraction."]
    };
  }

  private detectLocalRedFlags(text: string) {
    const flags = [
      ["self_harm", ["kill myself", "self harm", "hurt myself", "suicide", "end my life", "want to die", "can't go on", "cannot go on"]],
      ["panic", ["panic attack", "can't breathe", "cannot breathe", "hyperventilating", "overwhelming panic"]],
      ["chest_pain", ["chest pain", "tight chest"]],
      ["fainting", ["fainted", "passed out"]],
      ["urgent_physical", ["unexplained bleeding", "heavy bleeding", "severe bleeding", "shortness of breath", "trouble breathing", "sudden weakness", "worst headache"]],
      ["abuse_or_coercion", ["forced me", "afraid of him", "afraid of her", "coerced", "hit me", "threatened me", "unsafe at home", "controlling"]]
    ] as const;
    return flags.filter(([, terms]) => terms.some((term) => text.includes(term))).map(([name]) => name);
  }
}
