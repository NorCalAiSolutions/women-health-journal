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

## Vercel Deployment

Deploy the frontend and API as separate Vercel projects from this monorepo:

- Frontend project root: `apps/web`
- Frontend build command: `npm run build`
- Frontend output directory: `.next`
- Frontend environment variable: `NEXT_PUBLIC_API_URL=<your deployed API URL>`
- API project root: `apps/api`
- API environment variable: `WEB_ORIGIN=<your deployed frontend URL>`

`NEXT_PUBLIC_API_URL` must point to the backend API deployment, not the frontend site. For example, if the frontend is `https://women-health-journal.vercel.app`, the API should be a separate URL such as `https://women-health-journal-api.vercel.app`.

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
