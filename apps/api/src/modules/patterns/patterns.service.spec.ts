import { describe, expect, it } from "vitest";
import { PatternService } from "./patterns.service";

describe("PatternService", () => {
  it("detects increasing fatigue mentions", () => {
    const service = new PatternService();
    const now = Date.now();
    const entries = Array.from({ length: 6 }, (_, index) => ({
      occurredAt: new Date(now - (6 - index) * 24 * 60 * 60 * 1000).toISOString(),
      extraction: {
        extractedJson: {
          fatigue: index >= 3,
          cycleIrregularity: false,
          acne: false,
          pain: false,
          headache: false,
          digestiveIssues: false,
          libidoChange: false,
          sleepHours: 7,
          stress: null,
          mood: null,
          redFlagSignals: [],
          normalizedSymptoms: [],
          confidence: 0.7,
          evidence: [],
          limitations: []
        }
      }
    }));

    const fatigue = service.detect(entries, 7).find((result) => result.name === "Recurring fatigue");
    expect(fatigue?.trend).toBe("increasing");
    expect(fatigue?.severity).toBe("moderate");
  });
});
