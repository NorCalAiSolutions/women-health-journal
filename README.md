# Women’s Health Journal Companion AI

Production-oriented AI web app scaffold for private, non-diagnostic journaling, trend detection, red flag awareness, and doctor-ready exports.

The app never diagnoses disease. It surfaces observed patterns, uncertainty, evidence, confidence scores, and suggested professional follow-up when appropriate.

## Stack

- Frontend: Next.js, React, TypeScript, Recharts
- Backend: NestJS, TypeScript, JWT
- Database: PostgreSQL with the `whjournal` schema
- AI: OpenAI Responses API with Zod structured outputs
- Validation: Zod
- Privacy: field encryption hooks, consent controls, user export/delete paths

## Quick Start

```bash
npm install
cp .env.example .env
npm run dev
```

For local Postgres:

```bash
docker compose up -d postgres
```

Apply the database schema:

```bash
psql "$DATABASE_URL" -f database/schema.sql
```

In PowerShell, use:

```powershell
psql $env:DATABASE_URL -f database/schema.sql
```

## Deliverables

The requested architecture, schema, API specification, UI wireframes, prompts, extraction logic, pattern detection pseudocode, deployment plan, safety layer, and roadmaps are in [docs/product-spec.md](docs/product-spec.md).

## Safety Positioning

This is an informational wellness awareness product. It should display crisis resources and urgent care guidance for high-severity red flags, but it must not claim to diagnose, treat, cure, or prevent disease.
