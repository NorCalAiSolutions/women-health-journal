"use client";

import { useEffect, useMemo, useState } from "react";
import { Activity, AlertTriangle, BookOpen, Download, Eye, EyeOff, KeyRound, Lock, LogOut, Send, ShieldCheck, Sparkles, UserPlus } from "lucide-react";
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
  structuredJson?: Record<string, number | string>;
  extraction?: {
    extractedJson?: {
      fatigue?: boolean;
      acne?: boolean;
      cycleIrregularity?: boolean;
      confidence?: number;
      stress?: string | null;
      sleepHours?: number | null;
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

export default function Home() {
  const [authMode, setAuthMode] = useState<"login" | "register" | "verify" | "forgot" | "reset">("login");
  const [authUserId, setAuthUserId] = useState("");
  const [authEmail, setAuthEmail] = useState("");
  const [authCode, setAuthCode] = useState("");
  const [authPassword, setAuthPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [token, setToken] = useState<string | null>(null);
  const [authMessage, setAuthMessage] = useState("");
  const [rawText, setRawText] = useState("");
  const [sleepHours, setSleepHours] = useState("");
  const [energy, setEnergy] = useState(4);
  const [stress, setStress] = useState(6);
  const [consent, setConsent] = useState(true);
  const [result, setResult] = useState<Record<string, unknown> | null>(null);
  const [timeline, setTimeline] = useState<TimelineEntry[]>([]);
  const [selectedEntry, setSelectedEntry] = useState<JournalDetail | null>(null);
  const [lastSubmittedText, setLastSubmittedText] = useState("");
  const [journalMessage, setJournalMessage] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    setToken(localStorage.getItem("whjc_access_token"));
  }, []);

  useEffect(() => {
    if (token) {
      void loadTimeline(token);
    } else {
      setTimeline([]);
      setSelectedEntry(null);
    }
  }, [token]);

  const chartData = useMemo(() => {
    if (!timeline.length) return starterTimeline;
    return timeline.map((entry) => ({
      day: new Date(entry.occurredAt).toLocaleDateString(undefined, { month: "short", day: "numeric" }),
      sleep: Number(entry.extraction?.extractedJson?.sleepHours ?? entry.structuredJson?.sleepHours ?? 0),
      stress: Number(entry.structuredJson?.stress ?? 0),
      mood: entry.extraction?.extractedJson?.fatigue ? 4 : 7
    }));
  }, [timeline]);

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
    setJournalMessage("");
    setIsSubmitting(true);
    try {
      const response = await fetch(`${API_URL}/journal`, {
        method: "POST",
        headers: authHeaders(token),
        body: JSON.stringify({
          rawText,
          consentToAiAnalysis: consent,
          structured: {
            sleepHours: Number(sleepHours),
            energy,
            stress,
            symptoms: []
          }
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
      setResult(data);
      setLastSubmittedText(submittedText);
      await loadTimeline(token);
      setRawText("");
      setSleepHours("");
      setEnergy(4);
      setStress(6);
      setJournalMessage("Entry saved. AI extraction updated below.");
    } catch {
      setJournalMessage(`Could not reach the API at ${API_URL}. Keep the API server running on port 4000.`);
    } finally {
      setIsSubmitting(false);
    }
  }

  async function loadTimeline(activeToken: string) {
    const timelineResponse = await fetch(`${API_URL}/journal/timeline?range=90`, {
      headers: { Authorization: `Bearer ${activeToken}` }
    });
    const data = await timelineResponse.json();
    setTimeline(data.entries ?? []);
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
    const response = await fetch(`${API_URL}/exports/doctor.pdf?days=90`, {
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

  function logout() {
    localStorage.removeItem("whjc_access_token");
    setToken(null);
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
              <button className="secondary" onClick={logout}>
                <LogOut aria-hidden />
                Log Out
              </button>
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
                <p>{selectedEntry.rawText}</p>
                <pre>{JSON.stringify(selectedEntry.extraction ?? {}, null, 2)}</pre>
              </article>
            ) : (
              <p className="empty-state">Select an entry from history to review it here. Old entries are view-only.</p>
            )}
          </div>
        </section>

        <section className="charts" id="trends">
          <div className="panel">
            <h2>Mood and Stress Timeline</h2>
            <ResponsiveContainer width="100%" height={260}>
              <LineChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="day" />
                <YAxis />
                <Tooltip />
                <Line type="monotone" dataKey="mood" stroke="#1f7a8c" strokeWidth={2} />
                <Line type="monotone" dataKey="stress" stroke="#b23a48" strokeWidth={2} />
              </LineChart>
            </ResponsiveContainer>
          </div>
          <div className="panel">
            <h2>Sleep Trend</h2>
            <ResponsiveContainer width="100%" height={260}>
              <AreaChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="day" />
                <YAxis />
                <Tooltip />
                <Area type="monotone" dataKey="sleep" stroke="#3d405b" fill="#81b29a" fillOpacity={0.35} />
              </AreaChart>
            </ResponsiveContainer>
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
