"use client";

import { useEffect, useMemo, useState } from "react";
import { Activity, AlertTriangle, BookOpen, Download, Eye, EyeOff, FileText, HelpCircle, KeyRound, Lock, LogOut, Send, ShieldCheck, Sparkles, Trash2, Upload, UserPlus, X } from "lucide-react";
import {
  Area,
  AreaChart,
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis
} from "recharts";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";
const cycleSampleCsv = [
  ["Cycle Duration", "Flow", "Symptoms", "Notes"],
  ["May 1, 2026 - May 29, 2026", "Medium", "cramps; fatigue", "Optional notes without name, DOB, phone, email, or address"],
  ["May 30, 2026 - Jun 27, 2026", "Light", "acne; mood changes", "Cycle Duration first date is treated as the period start date"],
  ["Jun 28, 2026 - Jul 26, 2026", "Heavy", "headache; cramps", "The app stores sanitized text only; original files are not stored"]
]
  .map((row) => row.map((cell) => `"${cell.replaceAll("\"", "\"\"")}"`).join(","))
  .join("\n");

type TimelineEntry = {
  id: string;
  occurredAt: string;
  structuredJson?: Record<string, number | string | undefined>;
  extraction?: {
    analysisSource?: string;
    model?: string | null;
    extractedJson?: {
      fatigue?: boolean;
      acne?: boolean;
      cycleIrregularity?: boolean;
      confidence?: number;
      stress?: string | null;
      sleepHours?: number | null;
      mood?: string | null;
    };
  };
};

type JournalDetail = {
  id: string;
  occurredAt: string;
  rawText: string;
  structured?: Record<string, unknown>;
  extraction?: Record<string, unknown>;
  analysisSource?: string;
  analysisModel?: string | null;
  redFlags?: unknown[];
};

type CorrelationResult = {
  label: string;
  statement: string;
  confidence: number;
  evidenceCount: number;
  sampleSize: number;
  evidence?: string[];
  limitation: string;
};

type SafetyResource = {
  label: string;
  detail: string;
};

type RedFlag = {
  category: string;
  severity: "LOW" | "MODERATE" | "HIGH" | "URGENT";
  title?: string;
  guidance: string;
  resources?: SafetyResource[];
  matchedText?: string;
};

type JournalSubmitResult = {
  extraction?: Record<string, unknown>;
  analysisSource?: string;
  analysisModel?: string | null;
  redFlags?: RedFlag[];
  disclaimer?: string;
};

type AuthUser = {
  id?: string;
  userId?: string;
  displayName?: string;
  healthContext?: HealthContext;
  policyConsent?: PolicyConsentStatus;
};

type HealthContext = {
  ageRange?: string | null;
  periodStartedAgeRange?: string | null;
  hormonalMedicationContext?: string | null;
  pregnancyPostpartumStatus?: string | null;
  cycleBaseline?: string | null;
};

type PolicyConsentStatus = {
  required: boolean;
  version: string;
  missingScopes: string[];
  acceptedScopes: string[];
  acceptedAt?: string | null;
};

type CycleImportSummary = {
  id: string;
  sourceType: string;
  sourceLabel: string;
  confidence: number;
  ignoredIdentifiers: string[];
  createdAt: string;
  normalized: {
    periodStarts: string[];
    periodEnds: string[];
    cycleLengthsDays: number[];
    averageCycleLengthDays: number | null;
    cycleLengthRangeDays: [number, number] | null;
    flowNotes: string[];
    symptomNotes: string[];
    importedRows: number;
    limitations: string[];
  };
};

const starterTimeline = [
  { day: "Mon", mood: 6, sleep: 7.5, stress: 4 },
  { day: "Tue", mood: 5, sleep: 6, stress: 6 },
  { day: "Wed", mood: 7, sleep: 8, stress: 3 },
  { day: "Thu", mood: 4, sleep: 5.5, stress: 8 },
  { day: "Fri", mood: 5, sleep: 6.5, stress: 7 },
  { day: "Sat", mood: 7, sleep: 8.5, stress: 3 },
  { day: "Sun", mood: 6, sleep: 7, stress: 5 }
];

const sampleJournalText =
  "I slept 9 hours but still felt exhausted. Acne is getting worse. I am late on my period again and felt anxious after lunch.";

const moodScores: Record<string, number> = {
  very_low: 2,
  low: 4,
  neutral: 6,
  mixed: 6,
  good: 8,
  great: 10,
  anxious: 4,
  sad: 3
};

type ChartPoint = {
  day: string;
  entry: number;
  sleep: number | null;
  stress: number | null;
  mood: number;
};

type InsightSummary = {
  entryCount: number;
  averageSleep: number | null;
  averageStress: number | null;
  averageMood: number | null;
  commonSignals: string[];
  summary: string;
  attentionAreas: string[];
};

export default function Home() {
  const [authMode, setAuthMode] = useState<"login" | "register" | "verify" | "forgot" | "reset">("login");
  const [authUserId, setAuthUserId] = useState("");
  const [authEmail, setAuthEmail] = useState("");
  const [authCode, setAuthCode] = useState("");
  const [authPassword, setAuthPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [healthContext, setHealthContext] = useState<HealthContext>({});
  const [showPassword, setShowPassword] = useState(false);
  const [token, setToken] = useState<string | null>(null);
  const [signedInUser, setSignedInUser] = useState<AuthUser | null>(null);
  const [policyConsent, setPolicyConsent] = useState<PolicyConsentStatus | null>(null);
  const [policyChecks, setPolicyChecks] = useState({
    termsAccepted: false,
    privacyAccepted: false,
    aiDisclosureAccepted: false,
    dataRightsAccepted: false
  });
  const [authMessage, setAuthMessage] = useState("");
  const [rawText, setRawText] = useState("");
  const [sleepHours, setSleepHours] = useState("");
  const [mood, setMood] = useState("");
  const [energy, setEnergy] = useState(4);
  const [stress, setStress] = useState(6);
  const [consent, setConsent] = useState(true);
  const [result, setResult] = useState<JournalSubmitResult | null>(null);
  const [timeline, setTimeline] = useState<TimelineEntry[]>([]);
  const [correlations, setCorrelations] = useState<CorrelationResult[]>([]);
  const [cycleSummary, setCycleSummary] = useState<CycleImportSummary | null>(null);
  const [cycleMessage, setCycleMessage] = useState("");
  const [selectedEntry, setSelectedEntry] = useState<JournalDetail | null>(null);
  const [isHelpOpen, setIsHelpOpen] = useState(false);
  const [trendRange, setTrendRange] = useState(90);
  const [lastSubmittedText, setLastSubmittedText] = useState("");
  const [journalMessage, setJournalMessage] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    const storedToken = localStorage.getItem("whjc_access_token");
    setToken(storedToken);
    if (storedToken) {
      void loadCurrentUser(storedToken);
    }
  }, []);

  useEffect(() => {
    if (token) {
      void loadTimeline(token, trendRange);
      void loadCycleSummary(token);
    } else {
      setTimeline([]);
      setCorrelations([]);
      setCycleSummary(null);
      setCycleMessage("");
      setSelectedEntry(null);
    }
  }, [token, trendRange]);

  const chartData = useMemo(() => {
    if (!timeline.length) return token ? [] : starterTimeline;
    return timeline.slice(-30).map((entry, index) => chartPointFromTimeline(entry, index));
  }, [timeline, token]);

  const insightSummary = useMemo(() => buildInsightSummary(timeline), [timeline]);
  const needsPolicyConsent = Boolean(token && policyConsent?.required);

  async function submitJournal() {
    if (!token) {
      setAuthMessage("Please log in before submitting a journal entry.");
      return;
    }
    if (needsPolicyConsent) {
      setJournalMessage("Please review and accept the privacy and terms acknowledgements before journaling.");
      return;
    }
    if (!rawText.trim()) {
      setJournalMessage("Write a journal entry before submitting.");
      return;
    }
    const submittedText = rawText;
    const structured: Record<string, number | string | string[]> = {
      ...(sleepHours.trim() ? { sleepHours: Number(sleepHours) } : {}),
      ...(mood ? { mood } : {}),
      energy,
      stress,
      symptoms: []
    };
    setJournalMessage("");
    setIsSubmitting(true);
    try {
      const response = await fetch(`${API_URL}/journal`, {
        method: "POST",
        headers: authHeaders(token),
        body: JSON.stringify({
          rawText,
          consentToAiAnalysis: consent,
          structured
        })
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        if (isAuthExpired(data)) {
          expireSession();
          setJournalMessage("Your session expired. Please log in again, then resubmit this entry.");
          return;
        }
        setJournalMessage(formatApiError(data, "Could not save this journal entry."));
        return;
      }
      setResult(data as JournalSubmitResult);
      setLastSubmittedText(submittedText);
      await loadTimeline(token, trendRange);
      setRawText("");
      setSleepHours("");
      setMood("");
      setEnergy(4);
      setStress(6);
      setJournalMessage("Entry saved. AI extraction updated below.");
    } catch {
      setJournalMessage(`Could not reach the API at ${API_URL}. Keep the API server running on port 4000.`);
    } finally {
      setIsSubmitting(false);
    }
  }

  async function loadTimeline(activeToken: string, rangeDays: number) {
    const timelineResponse = await fetch(`${API_URL}/journal/timeline?range=${rangeDays}`, {
      headers: { Authorization: `Bearer ${activeToken}` }
    });
    const data = await timelineResponse.json();
    setTimeline(data.entries ?? []);
    setCorrelations(data.correlations ?? []);
  }

  async function loadEntry(entryId: string) {
    if (!token) return;
    const response = await fetch(`${API_URL}/journal/${entryId}`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    if (response.ok) {
      setSelectedEntry(await response.json());
    }
  }

  async function loadCycleSummary(activeToken: string) {
    const response = await fetch(`${API_URL}/cycle/summary`, {
      headers: { Authorization: `Bearer ${activeToken}` }
    });
    if (response.ok) {
      const data = await response.json();
      const latest = data.latest ?? null;
      setCycleSummary(latest);
      if (!latest) {
        setCycleMessage("");
      }
    }
  }

  async function uploadCycleSummary(file: File | undefined) {
    if (!token) {
      setAuthMessage("Please log in before importing a cycle summary.");
      return;
    }
    if (!file) return;

    const formData = new FormData();
    formData.append("file", file);
    setCycleMessage("Importing cycle summary...");
    const response = await fetch(`${API_URL}/cycle/import`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
      body: formData
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      setCycleMessage(formatApiError(data, "Could not import this cycle summary."));
      return;
    }
    setCycleSummary(data as CycleImportSummary);
    setCycleMessage("Cycle summary imported. Identifying fields were ignored before storage.");
  }

  function downloadCycleSample() {
    const blob = new Blob([cycleSampleCsv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = "whjc-cycle-summary-sample.csv";
    anchor.click();
    URL.revokeObjectURL(url);
    setCycleMessage("Sample CSV downloaded. Use the Cycle Duration column; the first date is the period start date.");
  }

  async function loadCurrentUser(activeToken: string) {
    const response = await fetch(`${API_URL}/auth/me`, {
      headers: { Authorization: `Bearer ${activeToken}` }
    });
    if (response.ok) {
      const user = await response.json();
      setSignedInUser(user);
      setPolicyConsent(user.policyConsent ?? null);
    }
  }

  async function acceptPolicyConsents() {
    if (!token) return;
    setAuthMessage("");
    const response = await fetch(`${API_URL}/auth/consents/policy`, {
      method: "POST",
      headers: authHeaders(token),
      body: JSON.stringify(policyChecks)
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      setAuthMessage(formatApiError(data, "Please accept all required acknowledgements."));
      return;
    }
    setPolicyConsent(data as PolicyConsentStatus);
    setAuthMessage("Privacy and terms acknowledgements saved.");
  }

  async function submitAuth() {
    setAuthMessage("");
    const endpoint =
      authMode === "login"
        ? "login"
        : authMode === "register"
          ? "register"
          : authMode === "verify"
            ? "verify-email"
            : authMode === "forgot"
              ? "request-password-reset"
              : "reset-password";
    let data: Record<string, unknown>;
    try {
      const response = await fetch(`${API_URL}/auth/${endpoint}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userId: authUserId,
          email: authEmail,
          code: authCode,
          password: authMode === "login" || authMode === "register" ? authPassword : undefined,
          newPassword: authMode === "reset" ? authPassword : undefined,
          displayName: displayName || undefined,
          ...(authMode === "register" ? cleanHealthContext(healthContext) : {})
        })
      });
      data = await response.json().catch(() => ({}));
      if (!response.ok) {
        setAuthMessage(formatApiError(data, "Authentication failed."));
        return;
      }
    } catch {
      setAuthMessage(`Could not reach the API at ${API_URL}. Make sure npm run dev is running and the API has started on port 4000.`);
      return;
    }
    if (authMode === "register") {
      setAuthMode("verify");
      setAuthMessage(
        data.devVerificationCode
          ? `Verification code: ${data.devVerificationCode}`
          : "Check your email for the verification code."
      );
      return;
    }
    if (authMode === "forgot") {
      setAuthMode("reset");
      setAuthMessage(data.devResetCode ? `Reset code: ${data.devResetCode}` : "If that user ID and email are registered, check your email for the reset code.");
      return;
    }
    const accessToken = String(data.accessToken ?? "");
    localStorage.setItem("whjc_access_token", accessToken);
    setCycleSummary(null);
    setCycleMessage("");
    setToken(accessToken);
    setSignedInUser((data.user as AuthUser | undefined) ?? null);
    await loadCurrentUser(accessToken);
    setAuthMessage(
      authMode === "reset"
        ? "Password reset. You are signed in."
        : `Signed in as ${authUserId}.`
    );
  }

  async function downloadExport() {
    if (!token) {
      setAuthMessage("Please log in before exporting.");
      return;
    }
    const response = await fetch(`${API_URL}/exports/doctor.pdf?days=${trendRange}`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    const blob = await response.blob();
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "health-journal-summary.pdf";
    link.click();
    URL.revokeObjectURL(url);
  }

  async function downloadAccountData() {
    if (!token) {
      setAuthMessage("Please log in before exporting account data.");
      return;
    }
    const response = await fetch(`${API_URL}/auth/account-export`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      setAuthMessage(formatApiError(data, "Could not export account data."));
      return;
    }
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "whjc-account-export.json";
    link.click();
    URL.revokeObjectURL(url);
    setAuthMessage("Account data export downloaded.");
  }

  async function deleteAccount() {
    if (!token) return;
    const confirmed = window.confirm("Delete this account and all saved journal data? This cannot be undone.");
    if (!confirmed) return;
    const response = await fetch(`${API_URL}/auth/account`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${token}` }
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      setAuthMessage(formatApiError(data, "Could not delete account."));
      return;
    }
    logout();
    setAuthMessage(String(data.message ?? "Account and journal data deleted."));
  }

  function logout() {
    localStorage.removeItem("whjc_access_token");
    setToken(null);
    setSignedInUser(null);
    setPolicyConsent(null);
    setPolicyChecks({
      termsAccepted: false,
      privacyAccepted: false,
      aiDisclosureAccepted: false,
      dataRightsAccepted: false
    });
    setAuthUserId("");
    setAuthEmail("");
    setAuthCode("");
    setAuthPassword("");
    setDisplayName("");
    setHealthContext({});
    setCycleSummary(null);
    setCycleMessage("");
    setShowPassword(false);
    setAuthMode("login");
    setAuthMessage("Signed out.");
  }

  function expireSession() {
    localStorage.removeItem("whjc_access_token");
    setToken(null);
    setAuthPassword("");
    setCycleSummary(null);
    setCycleMessage("");
    setShowPassword(false);
    setAuthMode("login");
  }

  function switchAuthMode(mode: "login" | "register" | "verify" | "forgot" | "reset") {
    setAuthMode(mode);
    setAuthMessage("");
    if (mode === "register" || mode === "login") {
      setCycleMessage("");
    }
  }

  function updateHealthContext(key: keyof HealthContext, value: string) {
    setHealthContext((current) => ({
      ...current,
      [key]: value || undefined
    }));
  }

  return (
    <main>
      <aside className="sidebar">
        <div className="brand">
          <ShieldCheck aria-hidden />
          <span>Women&apos;s Health Journal Companion AI</span>
        </div>
        <nav>
          <a href="#journal">Journal</a>
          <a href="#trends">Trends</a>
          <a href="#safety">Safety</a>
          <a href="#export">Doctor Export</a>
        </nav>
        <div className="privacy-note">
          <Lock aria-hidden />
          <span>Encrypted journal storage, user-controlled exports, no ad targeting.</span>
        </div>
      </aside>

      <section className="workspace">
        <header>
          <div>
            <p className="eyebrow">Supportive pattern awareness</p>
            <h1>Daily journal and wellness trend monitor</h1>
          </div>
          <div className="header-actions">
            <button className="icon-button" onClick={() => setIsHelpOpen(true)} title="Help">
              <HelpCircle aria-hidden />
            </button>
            <button className="icon-button" onClick={downloadExport} id="export" title="Download doctor PDF">
              <Download aria-hidden />
            </button>
          </div>
        </header>

        {isHelpOpen && (
          <div className="modal-backdrop" role="presentation" onClick={() => setIsHelpOpen(false)}>
            <section className="help-modal" role="dialog" aria-modal="true" aria-labelledby="help-title" onClick={(event) => event.stopPropagation()}>
              <div className="help-header">
                <div>
                  <p className="eyebrow">App guide</p>
                  <h2 id="help-title">What each control and section does</h2>
                </div>
                <button className="icon-button" onClick={() => setIsHelpOpen(false)} title="Close help">
                  <X aria-hidden />
                </button>
              </div>
              <div className="help-content">
                <article>
                  <h3>Buttons</h3>
                  <dl>
                    <dt>Help</dt>
                    <dd>Opens this guide.</dd>
                    <dt>Download doctor PDF</dt>
                    <dd>Downloads an informational doctor report for the selected trend range.</dd>
                    <dt>Log In</dt>
                    <dd>Signs in with your private app user ID and password.</dd>
                    <dt>Register / Create Account</dt>
                    <dd>Creates a new private app account and sends an email verification code.</dd>
                    <dt>Forgot my password</dt>
                    <dd>Sends a reset code when the user ID and email match an account.</dd>
                    <dt>Export Account Data</dt>
                    <dd>Downloads your account, consent, journal, AI extraction, safety, and cycle import data as JSON.</dd>
                    <dt>Import Apple Health Cycle</dt>
                    <dd>Opens the cycle file picker from the sign-in action area for Apple Health-style TXT, CSV, or PDF output.</dd>
                    <dt>Choose Apple Health File</dt>
                    <dd>Uploads an Apple Health-style cycle summary from the Imported Cycle Summary section. Identifying fields are ignored and the original file is not stored.</dd>
                    <dt>Download Sample CSV</dt>
                    <dd>Downloads a small template showing the useful cycle fields. The Cycle Duration column should contain the date range, with the first date as the period start.</dd>
                    <dt>Delete Account</dt>
                    <dd>Deletes your account and saved journal data after confirmation.</dd>
                    <dt>Log Out</dt>
                    <dd>Signs out and clears the sign-in fields.</dd>
                    <dt>Submit Entry</dt>
                    <dd>Saves today&apos;s journal entry and optionally analyzes it with AI.</dd>
                  </dl>
                </article>
                <article>
                  <h3>Sections</h3>
                  <dl>
                    <dt>Private App Sign-In</dt>
                    <dd>Handles login, registration, verification, password reset, account export, cycle import, and account deletion.</dd>
                    <dt>Privacy, Terms, and AI Use</dt>
                    <dd>Shows required acknowledgements before journaling is enabled for the current policy version.</dd>
                    <dt>Imported Cycle Summary</dt>
                    <dd>Shows normalized cycle context from an imported file, including average cycle length, recent starts, confidence, and ignored identifiers.</dd>
                    <dt>Today&apos;s Entry</dt>
                    <dd>Where you write a journal entry and optional structured fields such as sleep, mood, energy, and stress.</dd>
                    <dt>AI Extraction</dt>
                    <dd>Shows normalized observations, confidence, evidence, limitations, and whether OpenAI or local fallback analyzed the entry.</dd>
                    <dt>Safety Resources</dt>
                    <dd>Appears when wording suggests higher support or urgent-care awareness may be important.</dd>
                    <dt>Insights Summary</dt>
                    <dd>Summarizes recent entries, common signals, and areas to pay attention to in the selected range.</dd>
                    <dt>Journal History</dt>
                    <dd>Lists saved entries. Selecting one opens it as read-only.</dd>
                    <dt>Read-Only Entry</dt>
                    <dd>Displays the selected historical entry, structured values, AI signals, and extraction details without allowing edits.</dd>
                    <dt>Mood and Stress Timeline</dt>
                    <dd>Charts mood and stress over the chosen range.</dd>
                    <dt>Sleep Trend</dt>
                    <dd>Charts sleep hours over the chosen range.</dd>
                    <dt>Possible Associations</dt>
                    <dd>Shows non-causal associations such as stress with sleep or cycle context with symptoms, based on available entries.</dd>
                    <dt>Safety Layer</dt>
                    <dd>Explains that the app provides awareness support only and does not diagnose or monitor emergencies.</dd>
                  </dl>
                </article>
              </div>
            </section>
          </div>
        )}

        <section className="panel auth-panel">
          <div className="panel-title">
            <Lock aria-hidden />
            <h2>Private App Sign-In</h2>
          </div>
          {!token && (
            <div className="auth-grid">
              <label>
                User ID
                <input value={authUserId} onChange={(event) => setAuthUserId(event.target.value)} autoComplete="username" />
              </label>
              {(authMode === "register" || authMode === "forgot" || authMode === "reset") && (
                <label>
                  Email
                  <input type="email" value={authEmail} onChange={(event) => setAuthEmail(event.target.value)} autoComplete="email" />
                </label>
              )}
              {authMode === "register" && (
                <label>
                  Display name
                  <input value={displayName} onChange={(event) => setDisplayName(event.target.value)} autoComplete="name" />
                </label>
              )}
              {authMode === "register" && (
                <>
                  <label>
                    Age range
                    <select value={healthContext.ageRange ?? ""} onChange={(event) => updateHealthContext("ageRange", event.target.value)}>
                      <option value="">Optional</option>
                      <option value="13_17">13-17</option>
                      <option value="18_24">18-24</option>
                      <option value="25_34">25-34</option>
                      <option value="35_44">35-44</option>
                      <option value="45_plus">45+</option>
                      <option value="prefer_not_to_say">Prefer not to say</option>
                    </select>
                  </label>
                  <label>
                    Period started age
                    <select value={healthContext.periodStartedAgeRange ?? ""} onChange={(event) => updateHealthContext("periodStartedAgeRange", event.target.value)}>
                      <option value="">Optional</option>
                      <option value="before_10">Before 10</option>
                      <option value="10_12">10-12</option>
                      <option value="13_15">13-15</option>
                      <option value="16_plus">16+</option>
                      <option value="not_started">Not started</option>
                      <option value="not_sure">Not sure</option>
                      <option value="prefer_not_to_say">Prefer not to say</option>
                    </select>
                  </label>
                  <label>
                    Hormonal context
                    <select value={healthContext.hormonalMedicationContext ?? ""} onChange={(event) => updateHealthContext("hormonalMedicationContext", event.target.value)}>
                      <option value="">Optional</option>
                      <option value="none">None</option>
                      <option value="contraception">Contraception</option>
                      <option value="hormonal_medication">Hormonal medication</option>
                      <option value="both">Both</option>
                      <option value="unsure">Unsure</option>
                      <option value="prefer_not_to_say">Prefer not to say</option>
                    </select>
                  </label>
                  <label>
                    Pregnancy/postpartum
                    <select value={healthContext.pregnancyPostpartumStatus ?? ""} onChange={(event) => updateHealthContext("pregnancyPostpartumStatus", event.target.value)}>
                      <option value="">Optional</option>
                      <option value="not_pregnant_or_postpartum">Not pregnant/postpartum</option>
                      <option value="pregnant">Pregnant</option>
                      <option value="postpartum">Postpartum</option>
                      <option value="trying_to_conceive">Trying to conceive</option>
                      <option value="unsure">Unsure</option>
                      <option value="prefer_not_to_say">Prefer not to say</option>
                    </select>
                  </label>
                  <label>
                    Cycle baseline
                    <select value={healthContext.cycleBaseline ?? ""} onChange={(event) => updateHealthContext("cycleBaseline", event.target.value)}>
                      <option value="">Optional</option>
                      <option value="regular">Regular</option>
                      <option value="somewhat_irregular">Somewhat irregular</option>
                      <option value="irregular">Irregular</option>
                      <option value="no_periods">No periods</option>
                      <option value="not_sure">Not sure</option>
                      <option value="prefer_not_to_say">Prefer not to say</option>
                    </select>
                  </label>
                </>
              )}
              {(authMode === "verify" || authMode === "reset") && (
                <label>
                  Code
                  <input value={authCode} onChange={(event) => setAuthCode(event.target.value)} inputMode="numeric" />
                </label>
              )}
              {authMode !== "forgot" && authMode !== "verify" && (
                <label>
                  {authMode === "reset" ? "New password" : "Password"}
                  <span className="password-field">
                    <input
                      type={showPassword ? "text" : "password"}
                      value={authPassword}
                      onChange={(event) => setAuthPassword(event.target.value)}
                      autoComplete={authMode === "login" ? "current-password" : "new-password"}
                    />
                    <button
                      type="button"
                      className="field-icon"
                      onClick={() => setShowPassword((value) => !value)}
                      title={showPassword ? "Hide password" : "Show password"}
                    >
                      {showPassword ? <EyeOff aria-hidden /> : <Eye aria-hidden />}
                    </button>
                  </span>
                </label>
              )}
            </div>
          )}
          <div className="auth-actions">
            {!token && (
              <>
                <button onClick={submitAuth}>
                  {authMode === "login" ? <Lock aria-hidden /> : authMode === "register" ? <UserPlus aria-hidden /> : <KeyRound aria-hidden />}
                  {authMode === "login"
                    ? "Log In"
                    : authMode === "register"
                      ? "Create Account"
                      : authMode === "verify"
                        ? "Verify Email"
                        : authMode === "forgot"
                          ? "Email Reset Code"
                          : "Reset Password"}
                </button>
                <button className="secondary" onClick={() => switchAuthMode(authMode === "login" ? "register" : "login")}>
                  {authMode === "login" ? "Register" : "Use Login"}
                </button>
                {authMode === "login" && (
                  <button className="link-button" onClick={() => switchAuthMode("forgot")}>
                    Forgot my password
                  </button>
                )}
              </>
            )}
            {token && (
              <>
                <span className="signed-in-user">
                  Signed in as <b>{signedInUser?.displayName ?? signedInUser?.userId ?? "user"}</b>
                </span>
                <button className="secondary" onClick={downloadAccountData}>
                  <Download aria-hidden />
                  Export Account Data
                </button>
                <label className="file-button">
                  <Upload aria-hidden />
                  Import Apple Health Cycle
                  <input
                    type="file"
                    accept=".txt,.csv,.pdf,text/plain,text/csv,application/pdf"
                    onChange={(event) => {
                      void uploadCycleSummary(event.target.files?.[0]);
                      event.target.value = "";
                    }}
                  />
                </label>
                <button className="danger" onClick={deleteAccount}>
                  <Trash2 aria-hidden />
                  Delete Account
                </button>
                <button className="secondary" onClick={logout}>
                  <LogOut aria-hidden />
                  Log Out
                </button>
              </>
            )}
            <span>{authMessage}</span>
          </div>
        </section>

        {needsPolicyConsent && (
          <section className="panel policy-panel">
            <div className="panel-title">
              <FileText aria-hidden />
              <h2>Privacy, Terms, and AI Use</h2>
            </div>
            <p>
              Please review these acknowledgements before journaling. Version {policyConsent?.version}. This app supports wellness pattern awareness only and is not a medical diagnostic tool.
            </p>
            <div className="policy-grid">
              <article>
                <strong>Privacy Policy</strong>
                <span>Journal text is encrypted at rest. You control account export and deletion. The app does not use ad targeting.</span>
              </article>
              <article>
                <strong>Terms of Use</strong>
                <span>Insights are informational and may be incomplete or inaccurate. They are not a substitute for professional medical care.</span>
              </article>
              <article>
                <strong>AI Disclosure</strong>
                <span>When AI analysis is enabled, journal text and structured fields are sent to the configured AI provider to extract wellness observations.</span>
              </article>
              <article>
                <strong>Safety Limits</strong>
                <span>The app cannot monitor emergencies. If you may be in immediate danger, contact emergency services or a crisis resource.</span>
              </article>
            </div>
            <div className="policy-checks">
              <label>
                <input type="checkbox" checked={policyChecks.termsAccepted} onChange={(event) => setPolicyChecks((value) => ({ ...value, termsAccepted: event.target.checked }))} />
                I agree to the Terms of Use.
              </label>
              <label>
                <input type="checkbox" checked={policyChecks.privacyAccepted} onChange={(event) => setPolicyChecks((value) => ({ ...value, privacyAccepted: event.target.checked }))} />
                I understand the Privacy Policy and how my data is stored, exported, and deleted.
              </label>
              <label>
                <input type="checkbox" checked={policyChecks.aiDisclosureAccepted} onChange={(event) => setPolicyChecks((value) => ({ ...value, aiDisclosureAccepted: event.target.checked }))} />
                I understand AI analysis is optional per entry and does not diagnose conditions.
              </label>
              <label>
                <input type="checkbox" checked={policyChecks.dataRightsAccepted} onChange={(event) => setPolicyChecks((value) => ({ ...value, dataRightsAccepted: event.target.checked }))} />
                I understand I can export or delete my account data.
              </label>
            </div>
            <button onClick={acceptPolicyConsents} disabled={!allPolicyChecksAccepted(policyChecks)}>
              <ShieldCheck aria-hidden />
              Accept and Continue
            </button>
          </section>
        )}

        {token && (
          <section className="panel cycle-panel">
            <div className="panel-title">
              <Upload aria-hidden />
              <h2>Imported Cycle Summary</h2>
            </div>
            <div className="cycle-import-options">
              <article>
                <strong>Apple Health output</strong>
                <span>Upload a TXT, CSV, or PDF cycle summary exported from Apple Health or a similar cycle tracking app. Name, DOB, age, contact, and identifier fields are ignored before storage.</span>
                <label className="file-button">
                  <Upload aria-hidden />
                  Choose Apple Health File
                  <input
                    type="file"
                    accept=".txt,.csv,.pdf,text/plain,text/csv,application/pdf"
                    onChange={(event) => {
                      void uploadCycleSummary(event.target.files?.[0]);
                      event.target.value = "";
                    }}
                  />
                </label>
              </article>
              <article>
                <strong>Sample input file</strong>
                <span>Use the sample CSV if you want to provide cycle context manually. Include Cycle Duration, Flow, Symptoms, and Notes; the first date in Cycle Duration is treated as the period start date.</span>
                <button className="secondary" onClick={downloadCycleSample}>
                  <FileText aria-hidden />
                  Download Sample CSV
                </button>
              </article>
            </div>
            {!cycleSummary ? (
              <p className="empty-state">Import a TXT, CSV, or PDF cycle summary to add optional cycle context. The original file is not stored.</p>
            ) : (
              <div className="cycle-summary-grid">
                <article>
                  <span>Source</span>
                  <strong>{cycleSummary.sourceLabel}</strong>
                </article>
                <article>
                  <span>Avg cycle</span>
                  <strong>{cycleSummary.normalized.averageCycleLengthDays ? `${cycleSummary.normalized.averageCycleLengthDays} days` : "n/a"}</strong>
                </article>
                <article>
                  <span>Range</span>
                  <strong>{cycleSummary.normalized.cycleLengthRangeDays ? `${cycleSummary.normalized.cycleLengthRangeDays[0]}-${cycleSummary.normalized.cycleLengthRangeDays[1]} days` : "n/a"}</strong>
                </article>
                <article>
                  <span>Confidence</span>
                  <strong>{formatConfidence(cycleSummary.confidence)}</strong>
                </article>
                <div className="cycle-detail">
                  <b>Recent period starts</b>
                  <span>{cycleSummary.normalized.periodStarts.slice(-5).join(", ") || "No period start dates found"}</span>
                </div>
                <div className="cycle-detail">
                  <b>Ignored identifiers</b>
                  <span>{cycleSummary.ignoredIdentifiers.length ? cycleSummary.ignoredIdentifiers.join(", ") : "None detected"}</span>
                </div>
              </div>
            )}
            {cycleMessage && <p className="form-message">{cycleMessage}</p>}
          </section>
        )}

        <section className="grid">
          <div className="panel journal-panel" id="journal">
            <div className="panel-title">
              <Sparkles aria-hidden />
              <h2>Today&apos;s Entry</h2>
            </div>
            <textarea value={rawText} onChange={(event) => setRawText(event.target.value)} aria-label="Daily journal entry" disabled={needsPolicyConsent} />
            <div className="sample-note">
              <strong>Sample entry:</strong>
              <span>{sampleJournalText}</span>
            </div>
            <div className="fields">
              <label>
                Sleep hours
                <input value={sleepHours} onChange={(event) => setSleepHours(event.target.value)} inputMode="decimal" />
              </label>
              <label>
                Mood
                <select value={mood} onChange={(event) => setMood(event.target.value)}>
                  <option value="">Select mood</option>
                  <option value="very_low">Very low</option>
                  <option value="low">Low</option>
                  <option value="neutral">Neutral</option>
                  <option value="mixed">Mixed</option>
                  <option value="good">Good</option>
                  <option value="great">Great</option>
                </select>
              </label>
              <label>
                Energy
                <input type="range" min="1" max="10" value={energy} onChange={(event) => setEnergy(Number(event.target.value))} />
                <span>{energy}/10</span>
              </label>
              <label>
                Stress
                <input type="range" min="0" max="10" value={stress} onChange={(event) => setStress(Number(event.target.value))} />
                <span>{stress}/10</span>
              </label>
            </div>
            <label className="consent">
              <input type="checkbox" checked={consent} onChange={(event) => setConsent(event.target.checked)} />
              Analyze this entry with AI and store normalized observations.
            </label>
            <button onClick={submitJournal} disabled={isSubmitting || needsPolicyConsent}>
              <Send aria-hidden />
              {isSubmitting ? "Analyzing" : "Submit Entry"}
            </button>
            {journalMessage && <p className="form-message">{journalMessage}</p>}
            {lastSubmittedText && (
              <div className="last-submitted">
                <strong>Last submitted entry:</strong>
                <p>{lastSubmittedText}</p>
              </div>
            )}
          </div>

          <div className="panel result-panel">
            <div className="panel-title">
              <Activity aria-hidden />
              <h2>AI Extraction</h2>
            </div>
            <div className="analysis-meta">
              <span className={`analysis-badge source-${result?.analysisSource ?? "sample"}`}>
                {result?.analysisSource ? formatAnalysisSource(result.analysisSource) : "Sample output"}
              </span>
              {result?.analysisModel && <small>{result.analysisModel}</small>}
            </div>
            <pre>{result?.extraction ? JSON.stringify(result.extraction, null, 2) : `Sample output\n${JSON.stringify(sampleExtraction, null, 2)}`}</pre>
          </div>
        </section>

        {result?.redFlags?.length ? (
          <section className={`panel safety-resources severity-${highestSeverity(result.redFlags).toLowerCase()}`}>
            <div className="panel-title">
              <AlertTriangle aria-hidden />
              <h2>Safety Resources</h2>
            </div>
            <p>
              These resources are shown because your entry contained wording that may suggest urgent support or professional care could be important.
              This app cannot diagnose conditions or monitor emergencies.
            </p>
            <div className="resource-list">
              {result.redFlags.map((flag) => (
                <article className="resource-card" key={`${flag.category}-${flag.severity}`}>
                  <div>
                    <strong>{flag.title ?? safetyTitle(flag.category)}</strong>
                    <span>{flag.severity}</span>
                  </div>
                  <p>{flag.guidance}</p>
                  {flag.matchedText && <small>Signal: {flag.matchedText}</small>}
                  {flag.resources?.length ? (
                    <ul>
                      {flag.resources.map((resource) => (
                        <li key={resource.label}>
                          <b>{resource.label}:</b> {resource.detail}
                        </li>
                      ))}
                    </ul>
                  ) : null}
                </article>
              ))}
            </div>
          </section>
        ) : null}

        <section className="panel insights-panel">
          <div className="chart-heading">
            <h2>Insights Summary</h2>
            <span>{trendRange}-day range</span>
          </div>
          {!token && <p className="empty-state">Log in to view your trend summary.</p>}
          {token && !timeline.length && <p className="empty-state">Save a few journal entries to see a range summary here.</p>}
          {token && timeline.length ? (
            <>
              <div className="summary-metrics">
                <article>
                  <span>Entries</span>
                  <strong>{insightSummary.entryCount}</strong>
                </article>
                <article>
                  <span>Avg sleep</span>
                  <strong>{formatNullableNumber(insightSummary.averageSleep, "h")}</strong>
                </article>
                <article>
                  <span>Avg stress</span>
                  <strong>{formatNullableNumber(insightSummary.averageStress, "/10")}</strong>
                </article>
                <article>
                  <span>Avg mood</span>
                  <strong>{formatNullableNumber(insightSummary.averageMood, "/10")}</strong>
                </article>
              </div>
              <div className="insight-copy">
                <p>
                  Common signals: {insightSummary.commonSignals.length ? insightSummary.commonSignals.join(", ") : "not enough repeated signals yet"}.
                </p>
                <div className="user-summary">
                  <strong>Summary</strong>
                  <p>{insightSummary.summary}</p>
                </div>
                <div className="attention-areas">
                  <strong>Areas to pay attention to</strong>
                  <div>
                    {insightSummary.attentionAreas.map((area) => (
                      <span key={area}>{area}</span>
                    ))}
                  </div>
                </div>
                <em>Informational trend summary only. It cannot diagnose conditions or establish medical cause.</em>
              </div>
            </>
          ) : null}
        </section>

        <section className="grid history-grid">
          <div className="panel">
            <div className="panel-title">
              <BookOpen aria-hidden />
              <h2>Journal History</h2>
            </div>
            {!token && <p className="empty-state">Log in to view previous journal entries.</p>}
            {token && !timeline.length && <p className="empty-state">No saved journal entries yet.</p>}
            <div className="history-list">
              {timeline.map((entry) => (
                <button className="history-item" key={entry.id} onClick={() => loadEntry(entry.id)}>
                  <span>{new Date(entry.occurredAt).toLocaleString()}</span>
                  <small>
                    {entry.extraction?.extractedJson?.fatigue ? "fatigue " : ""}
                    {entry.extraction?.extractedJson?.acne ? "acne " : ""}
                    {entry.extraction?.extractedJson?.cycleIrregularity ? "cycle " : ""}
                    {!entry.extraction?.extractedJson ? "saved entry" : ""}
                    {entry.extraction?.analysisSource ? `- ${formatAnalysisSource(entry.extraction.analysisSource)}` : ""}
                  </small>
                </button>
              ))}
            </div>
          </div>
          <div className="panel">
            <div className="panel-title">
              <Activity aria-hidden />
              <h2>Read-Only Entry</h2>
            </div>
            {selectedEntry ? (
              <article className="read-only-entry">
                <time>{new Date(selectedEntry.occurredAt).toLocaleString()}</time>
                <div className="entry-summary">
                  {entrySummaryItems(selectedEntry).map((item) => (
                    <span key={item.label}>
                      <b>{item.label}</b>
                      {item.value}
                    </span>
                  ))}
                </div>
                <div className="signal-list">
                  <strong>AI signals</strong>
                  <span>{extractSignalNames(selectedEntry.extraction).join(", ") || "No AI signals available"}</span>
                </div>
                <div className="analysis-meta">
                  <span className={`analysis-badge source-${selectedEntry.analysisSource ?? "not_analyzed"}`}>
                    {formatAnalysisSource(selectedEntry.analysisSource)}
                  </span>
                  {selectedEntry.analysisModel && <small>{selectedEntry.analysisModel}</small>}
                </div>
                <p>{selectedEntry.rawText}</p>
                <details>
                  <summary>View extraction details</summary>
                  <pre>{JSON.stringify(selectedEntry.extraction ?? {}, null, 2)}</pre>
                </details>
              </article>
            ) : (
              <p className="empty-state">Select an entry from history to review it here. Old entries are view-only.</p>
            )}
          </div>
        </section>

        <section className="charts" id="trends">
          <div className="panel">
            <div className="chart-heading">
              <h2>Mood and Stress Timeline</h2>
              <label>
                Range
                <select value={trendRange} onChange={(event) => setTrendRange(Number(event.target.value))}>
                  <option value={7}>7 days</option>
                  <option value={30}>30 days</option>
                  <option value={90}>90 days</option>
                  <option value={365}>1 year</option>
                </select>
              </label>
            </div>
            {chartData.length ? (
              <ResponsiveContainer width="100%" height={260}>
                <LineChart data={chartData}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="day" />
                  <YAxis />
                  <Tooltip />
                  <Line type="monotone" dataKey="mood" stroke="#1f7a8c" strokeWidth={2} dot={{ r: 4 }} activeDot={{ r: 6 }} />
                  <Line type="monotone" dataKey="stress" stroke="#b23a48" strokeWidth={2} dot={{ r: 4 }} activeDot={{ r: 6 }} />
                </LineChart>
              </ResponsiveContainer>
            ) : (
              <div className="chart-empty">Mood and stress trends will appear after you save journal entries.</div>
            )}
          </div>
          <div className="panel">
            <div className="chart-heading">
              <h2>Sleep Trend</h2>
              <span>{timeline.length} entries</span>
            </div>
            {chartData.length ? (
              <ResponsiveContainer width="100%" height={260}>
                <AreaChart data={chartData}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="day" />
                  <YAxis />
                  <Tooltip />
                  <Area type="monotone" dataKey="sleep" stroke="#3d405b" fill="#81b29a" fillOpacity={0.35} dot={{ r: 4 }} activeDot={{ r: 6 }} />
                </AreaChart>
              </ResponsiveContainer>
            ) : (
              <div className="chart-empty">Sleep trends will appear after you save journal entries with sleep hours.</div>
            )}
          </div>
        </section>

        <section className="panel correlations-panel">
          <div className="chart-heading">
            <h2>Possible Associations</h2>
            <span>{trendRange}-day range</span>
          </div>
          {!token && <p className="empty-state">Log in to view possible associations.</p>}
          {token && !correlations.length && (
            <p className="empty-state">Possible associations will appear after you have saved journal entries with enough relevant mood, sleep, stress, cycle, or symptom data.</p>
          )}
          <div className="correlation-grid">
            {correlations.map((correlation) => (
              <article className="correlation-card" key={correlation.label}>
                <div>
                  <h3>{correlation.label}</h3>
                  <strong>{Math.round(correlation.confidence * 100)}% confidence</strong>
                </div>
                <p>{correlation.statement}</p>
                <small>
                  Evidence: {correlation.evidenceCount} of {correlation.sampleSize} relevant entries.
                </small>
                {correlation.evidence?.length ? (
                  <ul>
                    {correlation.evidence.map((item) => (
                      <li key={item}>{item}</li>
                    ))}
                  </ul>
                ) : (
                  <p className="empty-state">Not enough matching entries yet.</p>
                )}
                <em>{correlation.limitation}</em>
              </article>
            ))}
          </div>
        </section>

        <section className="safety" id="safety">
          <AlertTriangle aria-hidden />
          <div>
            <h2>Safety Layer</h2>
            <p>
              High-severity entries surface support resources and professional-care guidance. The app explains uncertainty and never labels a condition.
            </p>
          </div>
        </section>
      </section>
    </main>
  );
}

const sampleExtraction = {
  fatigue: true,
  cycleIrregularity: true,
  sleepHours: 9,
  acne: true,
  stress: "moderate",
  confidence: 0.81,
  evidence: ["slept 9 hours", "still felt exhausted", "late on my period"],
  limitations: ["Single-entry extraction cannot establish a medical cause."]
};

function authHeaders(token: string) {
  return {
    "Content-Type": "application/json",
    Authorization: `Bearer ${token}`
  };
}

function formatApiError(data: Record<string, unknown>, fallback: string) {
  const message = data.message;
  const requestId = typeof data.requestId === "string" ? ` Reference ID: ${data.requestId}` : "";
  if (Array.isArray(message)) return `${message.join(" ")}${requestId}`;
  if (typeof message === "string") return `${message}${requestId}`;
  return `${fallback}${requestId}`;
}

function isAuthExpired(data: Record<string, unknown>) {
  const message = data.message;
  return typeof message === "string" && message.toLowerCase().includes("expired bearer token");
}

function allPolicyChecksAccepted(checks: {
  termsAccepted: boolean;
  privacyAccepted: boolean;
  aiDisclosureAccepted: boolean;
  dataRightsAccepted: boolean;
}) {
  return checks.termsAccepted && checks.privacyAccepted && checks.aiDisclosureAccepted && checks.dataRightsAccepted;
}

function cleanHealthContext(context: HealthContext) {
  return Object.fromEntries(Object.entries(context).filter(([, value]) => Boolean(value)));
}

function chartPointFromTimeline(entry: TimelineEntry, index: number): ChartPoint {
  return chartPoint({
    occurredAt: entry.occurredAt,
    structured: entry.structuredJson,
    extraction: entry.extraction?.extractedJson,
    entryNumber: index + 1
  });
}

function chartPoint(input: {
  occurredAt: string;
  structured?: Record<string, unknown>;
  extraction?: Record<string, unknown>;
  entryNumber: number;
}): ChartPoint {
  const occurredAt = new Date(input.occurredAt);
  const moodValue = String(input.structured?.mood ?? input.extraction?.mood ?? "");
  return {
    day: `${occurredAt.toLocaleDateString(undefined, { month: "short", day: "numeric" })} ${occurredAt.toLocaleTimeString(undefined, {
      hour: "numeric",
      minute: "2-digit"
    })}`,
    entry: input.entryNumber,
    sleep: toChartNumber(input.extraction?.sleepHours ?? input.structured?.sleepHours),
    stress: toChartNumber(input.structured?.stress),
    mood: moodScores[moodValue] ?? (input.extraction?.fatigue ? 4 : 7)
  };
}

function toChartNumber(value: unknown) {
  if (value === null || value === undefined || value === "") return null;
  const numberValue = Number(value);
  return Number.isFinite(numberValue) ? numberValue : null;
}

function highestSeverity(flags: RedFlag[]) {
  const rank: Record<RedFlag["severity"], number> = {
    LOW: 1,
    MODERATE: 2,
    HIGH: 3,
    URGENT: 4
  };
  return flags.reduce<RedFlag["severity"]>((highest, flag) => (rank[flag.severity] > rank[highest] ? flag.severity : highest), "LOW");
}

function safetyTitle(category: string) {
  const titles: Record<string, string> = {
    mental_health_crisis: "Immediate emotional safety support",
    acute_anxiety_or_panic: "High distress or panic symptoms",
    urgent_physical_symptom: "Potential urgent physical symptom",
    relationship_safety: "Relationship or personal safety concern"
  };
  return titles[category] ?? "Safety resource";
}

function buildInsightSummary(entries: TimelineEntry[]): InsightSummary {
  const points = entries.map((entry, index) => chartPointFromTimeline(entry, index));
  const averageSleep = averageNullable(points.map((point) => point.sleep));
  const averageStress = averageNullable(points.map((point) => point.stress));
  const averageMood = averageNullable(points.map((point) => point.mood));
  const signalCounts = countTimelineSignals(entries);
  const commonSignals = Object.entries(signalCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([signal, count]) => `${humanize(signal)} (${count})`);

  return {
    entryCount: entries.length,
    averageSleep,
    averageStress,
    averageMood,
    commonSignals,
    summary: buildUserFacingSummary(entries, { averageSleep, averageStress, averageMood }, commonSignals),
    attentionAreas: buildAttentionAreas(entries, { averageSleep, averageStress, averageMood }, signalCounts)
  };
}

function buildUserFacingSummary(
  entries: TimelineEntry[],
  averages: Pick<InsightSummary, "averageSleep" | "averageStress" | "averageMood">,
  commonSignals: string[]
) {
  const sleepText = averages.averageSleep === null ? "sleep data was limited" : `sleep averaged ${averages.averageSleep.toFixed(1)} hours`;
  const stressText = averages.averageStress === null ? "stress data was limited" : `stress averaged ${averages.averageStress.toFixed(1)}/10`;
  const moodText = averages.averageMood === null ? "mood data was limited" : `mood averaged ${averages.averageMood.toFixed(1)}/10`;
  const signalText = commonSignals.length ? `The most repeated signals were ${commonSignals.join(", ")}.` : "There were not enough repeated AI-observed signals yet.";

  return `Over this range, you logged ${entries.length} entr${entries.length === 1 ? "y" : "ies"}. ${capitalizeSentence(sleepText)}, ${stressText}, and ${moodText}. ${signalText} These patterns do not diagnose a condition, but they may be worth reflecting on or discussing with a healthcare professional if they feel persistent, worsening, or disruptive.`;
}

function buildAttentionAreas(
  entries: TimelineEntry[],
  averages: Pick<InsightSummary, "averageSleep" | "averageStress" | "averageMood">,
  signalCounts: Record<string, number>
) {
  const areas: string[] = [];
  if (entries.length < 3) {
    areas.push("More entries for clearer patterns");
  }
  if (averages.averageSleep !== null && averages.averageSleep < 6.5) {
    areas.push("Sleep below 6.5 hours");
  }
  if (averages.averageStress !== null && averages.averageStress >= 7) {
    areas.push("High stress average");
  }
  if (averages.averageMood !== null && averages.averageMood <= 4.5) {
    areas.push("Lower mood pattern");
  }
  for (const [signal, count] of Object.entries(signalCounts).sort((a, b) => b[1] - a[1]).slice(0, 3)) {
    if (count >= 2) {
      areas.push(`Repeated ${humanize(signal)}`);
    }
  }
  return areas.length ? areas : ["No strong repeated pattern yet"];
}

function countTimelineSignals(entries: TimelineEntry[]) {
  const counts: Record<string, number> = {};
  for (const entry of entries) {
    for (const signal of extractSignalNames(entry.extraction?.extractedJson)) {
      counts[signal] = (counts[signal] ?? 0) + 1;
    }
  }
  return counts;
}

function entrySummaryItems(entry: JournalDetail) {
  const structured = entry.structured ?? {};
  const extraction = entry.extraction ?? {};
  return [
    { label: "Sleep", value: formatUnknown(structured.sleepHours ?? extraction.sleepHours, "h") },
    { label: "Mood", value: humanize(String(structured.mood ?? extraction.mood ?? "not entered")) },
    { label: "Energy", value: formatUnknown(structured.energy, "/10") },
    { label: "Stress", value: formatUnknown(structured.stress, "/10") },
    { label: "Confidence", value: formatConfidence(extraction.confidence) },
    { label: "Analysis", value: formatAnalysisSource(entry.analysisSource) }
  ];
}

function extractSignalNames(extraction: Record<string, unknown> | undefined) {
  if (!extraction) return [];
  const listed = Array.isArray(extraction.normalizedSymptoms) ? extraction.normalizedSymptoms.map(String) : [];
  const flagged = ["fatigue", "acne", "pain", "headache", "digestiveIssues", "libidoChange", "cycleIrregularity"].filter(
    (key) => extraction[key] === true
  );
  return Array.from(new Set([...listed, ...flagged])).map(humanize);
}

function averageNullable(values: Array<number | null>) {
  const numbers = values.filter((value): value is number => value !== null && Number.isFinite(value));
  if (!numbers.length) return null;
  return numbers.reduce((sum, value) => sum + value, 0) / numbers.length;
}

function formatNullableNumber(value: number | null, suffix: string) {
  return value === null ? "n/a" : `${value.toFixed(1)}${suffix}`;
}

function formatUnknown(value: unknown, suffix = "") {
  if (value === null || value === undefined || value === "") return "Not entered";
  return `${value}${suffix}`;
}

function formatConfidence(value: unknown) {
  const numberValue = Number(value);
  return Number.isFinite(numberValue) ? `${Math.round(numberValue * 100)}%` : "n/a";
}

function formatAnalysisSource(value: unknown) {
  if (value === "openai_llm") return "OpenAI LLM";
  if (value === "local_fallback") return "Local fallback";
  if (value === "not_requested" || value === "not_analyzed") return "Not analyzed";
  if (value === "unknown") return "Unknown source";
  return "Not analyzed";
}

function humanize(value: string) {
  if (!value || value === "undefined" || value === "null") return "Not entered";
  return value
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/_/g, " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function capitalizeSentence(value: string) {
  return value ? `${value[0].toUpperCase()}${value.slice(1)}` : value;
}
