# Women’s Health Journal Companion AI Product Spec

## 1. System Architecture

Client: Next.js web app for daily journaling, structured inputs, timelines, safety notices, and doctor exports.

API: NestJS service with modules for auth, journals, AI extraction, pattern detection, safety, and exports.

Data: PostgreSQL using the `whjournal` schema. Raw journals are encrypted separately from structured features and AI observations.

AI: OpenAI Responses API with Zod Structured Outputs for normalized extraction and insight generation. Deterministic rules run alongside AI for red flags and trend scoring.

Privacy: TLS in production, field-level encryption for sensitive text, consent records, audit logs, user export, and deletion workflows.

## 2. Database Schema

See [database/schema.sql](../database/schema.sql).

Key tables:

- `whjournal.users`: identity, soft deletion.
- `whjournal.consents`: AI analysis, exports, optional research opt-in.
- `whjournal.journal_entries`: encrypted raw text, structured fields, date.
- `whjournal.ai_extractions`: normalized observations, confidence, evidence, model metadata.
- `whjournal.pattern_observations`: persisted trends and limitations.
- `whjournal.red_flag_events`: high-priority safety events.
- `whjournal.doctor_exports`: generated export metadata.
- `whjournal.audit_events`: privacy and security event trail.

## 3. API Specification

- `POST /journal`: create journal entry, optionally analyze with AI, return extraction and red flags.
- `GET /journal/timeline?range=90`: return entries, patterns, and correlations.
- `GET /journal/insights`: generate explainable wellness insight summary.
- `GET /journal/:id`: retrieve one decrypted entry for the owner.
- `GET /exports/doctor.pdf?days=90`: generate doctor-facing PDF summary.

Production auth should replace the current demo-user adapter with JWT guards and row ownership checks.

## 4. UI Wireframes

Dashboard layout:

```text
| Sidebar                 | Header: product + export button              |
| Journal                 | [Today's Entry]      [AI Extraction JSON]    |
| Trends                  | [Mood/Stress Chart]  [Sleep Chart]           |
| Safety                  | Red flag explanation and resource surface    |
```

Mobile:

```text
Brand
Journal editor
Structured fields
Submit
Extraction
Charts
Safety
Export
```

## 5. Folder Structure

```text
apps/api       NestJS backend
apps/web       Next.js frontend
packages/shared Zod schemas and shared types
database       PostgreSQL SQL schema
docs           Product and implementation specs
infra          Deployment support
```

## 6. Prompt Templates

Extraction prompt: [apps/api/src/modules/ai/prompts.ts](../apps/api/src/modules/ai/prompts.ts)

Insight prompt: [apps/api/src/modules/ai/prompts.ts](../apps/api/src/modules/ai/prompts.ts)

Rules:

- Never diagnose.
- Extract only supported observations.
- Return confidence, evidence, and limitations.
- Escalate self-harm, severe physical symptoms, coercion, or abuse indicators.
- Use uncertainty language for ambiguous signals.

## 7. AI Extraction Logic

1. Validate journal input with Zod.
2. Encrypt raw free text with AES-256-GCM.
3. Send raw text and structured fields to Responses API.
4. Parse response with `zodTextFormat(ExtractedObservationSchema, "journal_extraction")`.
5. Store extracted entities, confidence, evidence, limitations, timestamp, and model.
6. Run deterministic safety rules over both raw text and model-extracted red flag signals.

The implementation follows OpenAI guidance that the Responses API can create text or JSON outputs and that Structured Outputs can enforce a supplied schema with JavaScript/Zod helpers.

## 8. Pattern Detection Pseudocode

```text
for each window in [7, 30, 90, 365]:
  entries = journal entries in window
  if entries < minimum:
    return insufficient_data

  for each boolean symptom:
    first_half_count = count symptom in first half
    second_half_count = count symptom in second half
    trend = increasing/decreasing/stable
    confidence = function(entry_count, prevalence, consistency)
    severity = function(prevalence, trend, red_flags)
    attach evidence entries and limitations

  for each numeric field:
    compare average first half vs second half
    classify trend by domain threshold
    attach uncertainty for missing data
```

## 9. Dashboard Screens

- Daily journal: free text plus sleep, energy, stress, symptoms, cycle, meds.
- AI extraction: normalized observation output with confidence/evidence.
- Timeline: mood, symptoms, cycle, sleep, stress, and journal frequency.
- Correlations: association statements with confidence and no causal language.
- Safety: red flag severity and support resources.
- Doctor export: PDF with symptom history, cycle summary, timelines, questions, disclaimer.

## 10. Production Deployment Plan

1. Host web on Vercel or containerized Node.
2. Host API on ECS, Fly.io, Render, or Kubernetes behind HTTPS.
3. Use managed PostgreSQL with encrypted volumes and automated backups.
4. Store PDFs in encrypted object storage with short-lived signed URLs.
5. Manage secrets in a cloud secret manager.
6. Enforce TLS, HSTS, CSP, rate limits, request size limits, and structured audit logging.
7. Add CI for typecheck, lint, unit tests, SQL migration checks, and container scans.
8. Add observability for latency, AI errors, safety events, and export generation without logging raw journal text.

## 11. Safety and Compliance Layer

- Prominent non-diagnostic disclaimer.
- Crisis and urgent-care routing for high/urgent red flags.
- No disease labels in generated output.
- Evidence-backed insight format.
- Consent before AI analysis.
- Data deletion and export controls.
- No ad targeting.
- Minimize PHI exposure in logs.
- Human-readable limitations on every AI output.

This app is not a HIPAA-compliant product by default. If offered by or on behalf of covered entities, add a formal HIPAA program, BAA-covered vendors, access controls, retention policy, risk assessments, and incident response procedures.

## 12. MVP Roadmap

1. Auth with JWT guards and password reset.
2. Journal CRUD with encrypted text.
3. AI extraction with schema validation.
4. Timeline charts and 7/30/90-day trend detection.
5. Red flag detection and support resources.
6. Doctor PDF export.
7. Consent, delete account, export data.

## 13. Premium Feature Roadmap

- Wearable imports for sleep, HRV, steps, and temperature.
- Cycle prediction and symptom overlays.
- Personalized reflection prompts.
- Semantic memory search over encrypted embeddings.
- Clinician-share links with expiration.
- Multi-language support.
- Advanced correlation explorer with user-controlled variables.
