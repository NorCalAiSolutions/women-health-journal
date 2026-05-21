"use client";

import { useEffect, useMemo, useState } from "react";
import { Activity, AlertTriangle, BookOpen, Download, Eye, EyeOff, KeyRound, Lock, LogOut, Send, ShieldCheck, Sparkles, Trash2, UserPlus } from "lucide-react";
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

type TimelineEntry = {
  id: string;
  occurredAt: string;
  structuredJson?: Record<string, number | string | undefined>;
  extraction?: {
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
  redFlags?: RedFlag[];
  disclaimer?: string;
};

type AuthUser = {
  id?: string;
  userId?: string;
  displayName?: string;
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
  const [showPassword, setShowPassword] = useState(false);
  const [token, setToken] = useState<string | null>(null);
  const [signedInUser, setSignedInUser] = useState<AuthUser | null>(null);
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
  const [selectedEntry, setSelectedEntry] = useState<JournalDetail | null>(null);
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
    } else {
      setTimeline([]);
      setCorrelations([]);
      setSelectedEntry(null);
    }
  }, [token, trendRange]);

  const chartData = useMemo(() => {
    if (!timeline.length) return token ? [] : starterTimeline;
    return timeline.slice(-30).map((entry, index) => chartPointFromTimeline(entry, index));
  }, [timeline, token]);

  const insightSummary = useMemo(() => buildInsightSummary(timeline), [timeline]);

  async function submitJournal() {
    if (!token) {
      setAuthMessage("Please log in before submitting a journal entry.");
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

  async function loadCurrentUser(activeToken: string) {
    const response = await fetch(`${API_URL}/auth/me`, {
      headers: { Authorization: `Bearer ${activeToken}` }
    });
    if (response.ok) {
      setSignedInUser(await response.json());
    }
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
          displayName: displayName || undefined
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
      setAuthMessage(data.devResetCode ? `Reset code: ${data.devResetCode}` : "Check your email for the reset code.");
      return;
    }
    const accessToken = String(data.accessToken ?? "");
    localStorage.setItem("whjc_access_token", accessToken);
    setToken(accessToken);
    setSignedInUser((data.user as AuthUser | undefined) ?? null);
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
    setAuthUserId("");
    setAuthEmail("");
    setAuthCode("");
    setAuthPassword("");
    setDisplayName("");
    setShowPassword(false);
    setAuthMode("login");
    setAuthMessage("Signed out.");
  }

  function expireSession() {
    localStorage.removeItem("whjc_access_token");
    setToken(null);
    setAuthPassword("");
    setShowPassword(false);
    setAuthMode("login");
  }

  function switchAuthMode(mode: "login" | "register" | "verify" | "forgot" | "reset") {
    setAuthMode(mode);
    setAuthMessage("");
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
          <button className="icon-button" onClick={downloadExport} id="export" title="Download doctor PDF">
            <Download aria-hidden />
          </button>
        </header>

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

        <section className="grid">
          <div className="panel journal-panel" id="journal">
            <div className="panel-title">
              <Sparkles aria-hidden />
              <h2>Today&apos;s Entry</h2>
            </div>
            <textarea value={rawText} onChange={(event) => setRawText(event.target.value)} aria-label="Daily journal entry" />
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
            <button onClick={submitJournal} disabled={isSubmitting}>
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
  if (Array.isArray(message)) return message.join(" ");
  if (typeof message === "string") return message;
  return fallback;
}

function isAuthExpired(data: Record<string, unknown>) {
  const message = data.message;
  return typeof message === "string" && message.toLowerCase().includes("expired bearer token");
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
    { label: "Confidence", value: formatConfidence(extraction.confidence) }
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
