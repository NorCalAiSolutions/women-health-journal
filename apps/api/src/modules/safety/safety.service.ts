import { Injectable } from "@nestjs/common";
import { ExtractedObservation } from "@whjc/shared";

export type RedFlag = {
  category: string;
  severity: "LOW" | "MODERATE" | "HIGH" | "URGENT";
  guidance: string;
  matchedText?: string;
};

@Injectable()
export class SafetyService {
  evaluate(rawText: string, extraction: ExtractedObservation): RedFlag[] {
    const text = rawText.toLowerCase();
    const flags: RedFlag[] = [];

    if (extraction.redFlagSignals.includes("self_harm") || /suicide|kill myself|hurt myself|self harm/.test(text)) {
      flags.push({
        category: "mental_health_crisis",
        severity: "URGENT",
        guidance:
          "If you may hurt yourself or are in immediate danger, call emergency services now. In the U.S. or Canada, call or text 988 for crisis support."
      });
    }

    if (/chest pain|fainted|passed out|unexplained bleeding|heavy bleeding/.test(text)) {
      flags.push({
        category: "urgent_physical_symptom",
        severity: "HIGH",
        guidance: "Consider urgent medical care for sudden, severe, or unexplained physical symptoms."
      });
    }

    if (/forced me|coerced|afraid of my partner|afraid of him|afraid of her|abuse/.test(text)) {
      flags.push({
        category: "relationship_safety",
        severity: "HIGH",
        guidance: "If you feel unsafe, contact local emergency services or a trusted support organization when it is safe to do so."
      });
    }

    return flags;
  }
}
