import { Injectable } from "@nestjs/common";
import { ExtractedObservation } from "@whjc/shared";

export type RedFlag = {
  category: string;
  severity: "LOW" | "MODERATE" | "HIGH" | "URGENT";
  title: string;
  guidance: string;
  resources: { label: string; detail: string }[];
  matchedText?: string;
};

@Injectable()
export class SafetyService {
  evaluate(rawText: string, extraction: ExtractedObservation): RedFlag[] {
    const text = rawText.toLowerCase();
    const flags: RedFlag[] = [];

    if (extraction.redFlagSignals.includes("self_harm") || /suicide|kill myself|hurt myself|self harm|end my life|can't go on|cannot go on|want to die/.test(text)) {
      flags.push({
        category: "mental_health_crisis",
        severity: "URGENT",
        title: "Immediate emotional safety support",
        guidance:
          "Your entry includes language that may suggest immediate emotional danger. This app cannot monitor emergencies. If you might hurt yourself or feel unable to stay safe, contact emergency services now or call/text 988 in the U.S. and Canada.",
        resources: [
          { label: "988 Suicide & Crisis Lifeline", detail: "Call or text 988 in the U.S. and Canada for immediate crisis support." },
          { label: "Emergency services", detail: "Call 911 in the U.S. if there is immediate danger or a medical emergency." },
          { label: "Trusted person", detail: "If possible, stay near someone you trust while getting help." }
        ]
      });
    }

    if (/panic attack|can't breathe|cannot breathe|hyperventilating|overwhelming panic/.test(text)) {
      flags.push({
        category: "acute_anxiety_or_panic",
        severity: "HIGH",
        title: "High distress or panic symptoms",
        guidance:
          "Panic symptoms can feel frightening. If breathing trouble, chest pain, fainting, or danger is present, seek urgent medical help. For ongoing or escalating panic, consider contacting a mental health professional.",
        resources: [
          { label: "Urgent care or emergency services", detail: "Use urgent care or 911 if symptoms feel medically dangerous." },
          { label: "988", detail: "Call or text 988 if panic comes with thoughts of self-harm or inability to stay safe." }
        ]
      });
    }

    if (/chest pain|fainted|passed out|unexplained bleeding|heavy bleeding|severe bleeding|shortness of breath|trouble breathing|sudden weakness|worst headache/.test(text)) {
      flags.push({
        category: "urgent_physical_symptom",
        severity: "HIGH",
        title: "Potential urgent physical symptom",
        guidance:
          "Chest pain, fainting, trouble breathing, sudden weakness, severe headache, or heavy unexplained bleeding can require urgent medical attention. Consider urgent care or emergency services now.",
        resources: [
          { label: "Emergency services", detail: "Call 911 in the U.S. for severe, sudden, or life-threatening symptoms." },
          { label: "Urgent care", detail: "Seek same-day medical care for concerning symptoms that are not immediately life-threatening." }
        ]
      });
    }

    if (/forced me|coerced|afraid of my partner|afraid of him|afraid of her|abuse|hit me|threatened me|unsafe at home|controlling/.test(text)) {
      flags.push({
        category: "relationship_safety",
        severity: "HIGH",
        title: "Relationship or personal safety concern",
        guidance:
          "Your entry may describe coercion, abuse, threats, or feeling unsafe. If you are in immediate danger, call emergency services. If it is safe, consider contacting a trusted person or a relationship safety support organization.",
        resources: [
          { label: "National Domestic Violence Hotline", detail: "U.S.: 1-800-799-7233 or text START to 88788." },
          { label: "Emergency services", detail: "Call 911 in the U.S. if you are in immediate danger." },
          { label: "Privacy reminder", detail: "Use a safe device or private browser if someone may monitor your activity." }
        ]
      });
    }

    return flags;
  }
}
