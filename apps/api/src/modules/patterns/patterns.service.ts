import { Injectable } from "@nestjs/common";
import { ExtractedObservation, PatternResult } from "@whjc/shared";

type HistoricalEntry = {
  occurredAt: string;
  structuredJson?: Record<string, unknown>;
  extraction?: { extractedJson: ExtractedObservation };
};

@Injectable()
export class PatternService {
  detect(entries: HistoricalEntry[], windowDays: number): PatternResult[] {
    const cutoff = Date.now() - windowDays * 24 * 60 * 60 * 1000;
    const window = entries.filter((entry) => new Date(entry.occurredAt).getTime() >= cutoff);
    if (window.length < 3) {
      return [this.insufficient("Not enough entries for reliable pattern detection.", windowDays)];
    }

    return [
      this.booleanTrend("Recurring fatigue", "fatigue", window, windowDays),
      this.booleanTrend("Worsening acne mentions", "acne", window, windowDays),
      this.booleanTrend("Cycle irregularity mentions", "cycleIrregularity", window, windowDays),
      this.numericTrend("Sleep trend", (entry) => Number(entry.extraction?.extractedJson.sleepHours ?? entry.structuredJson?.sleepHours), window, windowDays),
      this.numericTrend("Stress trend", (entry) => Number(entry.structuredJson?.stress), window, windowDays)
    ];
  }

  discoverCorrelations(entries: HistoricalEntry[]) {
    const usable = entries.filter((entry) => entry.extraction?.extractedJson);
    const poorSleepFatigue = usable.filter((entry) => {
      const sleep = Number(entry.extraction?.extractedJson.sleepHours ?? entry.structuredJson?.sleepHours);
      return sleep > 0 && sleep < 6 && entry.extraction?.extractedJson.fatigue;
    }).length;

    return [
      {
        statement: "Fatigue appears more frequently after shorter sleep entries.",
        confidence: usable.length ? Math.min(0.85, poorSleepFatigue / Math.max(usable.length, 1) + 0.25) : 0.1,
        limitation: "This is an association only and does not imply causation."
      }
    ];
  }

  private booleanTrend(name: string, key: keyof ExtractedObservation, entries: HistoricalEntry[], windowDays: number): PatternResult {
    const hits = entries.map((entry) => Boolean(entry.extraction?.extractedJson[key]));
    const firstHalf = hits.slice(0, Math.ceil(hits.length / 2)).filter(Boolean).length;
    const secondHalf = hits.slice(Math.ceil(hits.length / 2)).filter(Boolean).length;
    const trend = secondHalf > firstHalf ? "increasing" : secondHalf < firstHalf ? "decreasing" : "stable";
    const prevalence = hits.filter(Boolean).length / hits.length;

    return {
      name,
      windowDays,
      trend,
      confidence: Number(Math.min(0.9, 0.35 + prevalence).toFixed(2)),
      severity: prevalence >= 0.5 && trend === "increasing" ? "moderate" : "low",
      evidence: entries
        .filter((entry) => Boolean(entry.extraction?.extractedJson[key]))
        .slice(-3)
        .map((entry) => ({ source: "history", field: String(key), value: true, occurredAt: entry.occurredAt })),
      limitations: ["Pattern detection depends on journal consistency and cannot diagnose conditions."]
    };
  }

  private numericTrend(name: string, accessor: (entry: HistoricalEntry) => number, entries: HistoricalEntry[], windowDays: number): PatternResult {
    const values = entries.map(accessor).filter(Number.isFinite);
    if (values.length < 3) {
      return this.insufficient(`${name} has too few numeric values.`, windowDays);
    }
    const first = average(values.slice(0, Math.ceil(values.length / 2)));
    const second = average(values.slice(Math.ceil(values.length / 2)));
    const delta = second - first;

    return {
      name,
      windowDays,
      trend: Math.abs(delta) < 0.4 ? "stable" : delta > 0 ? "increasing" : "decreasing",
      confidence: Number(Math.min(0.88, 0.45 + values.length / 30).toFixed(2)),
      severity: Math.abs(delta) > 2 ? "moderate" : "low",
      evidence: [{ source: "history", field: name, value: `average changed from ${first.toFixed(1)} to ${second.toFixed(1)}` }],
      limitations: ["Numeric trends can be skewed by missing entries or unusual days."]
    };
  }

  private insufficient(reason: string, windowDays: number): PatternResult {
    return {
      name: "Insufficient data",
      windowDays,
      trend: "insufficient_data",
      confidence: 0.1,
      severity: "low",
      evidence: [{ source: "rule", value: reason }],
      limitations: [reason]
    };
  }
}

function average(values: number[]) {
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}
