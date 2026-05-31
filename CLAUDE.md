# CLAUDE.md — Development Guide for AI Assistants

This file gives Claude (and any AI assistant or contributor) the operating rules
for working on the **AI Share Market Analysis Tool** repository. Read this before
making any change.

---

## 1. Project Snapshot

A monorepo with three services:

| Folder | Stack | Role |
|---|---|---|
| `frontend/` | Next.js + React + TypeScript + Tailwind | Dark-mode trading dashboard (UI) |
| `backend/` | Node.js + Express + TypeScript | API gateway / orchestration |
| `ai-engine/` | Python + FastAPI | Analysis & AI scoring service |
| `docs/` | Markdown | Architecture, API, roadmap, data integration |

Target market: **Indian stock market** (Equity, Futures, Options, Nifty, Bank
Nifty, Fin Nifty).

**Current status: Phase 1 — foundation only.** Mock/placeholder data everywhere.
No live data, no broker APIs, no real AI calls.

---

## 2. Golden Rules (always follow)

1. **Always work phase-wise.** Do not jump ahead and build live-trading features
   during a setup/foundation phase. Confirm which phase a task belongs to.
2. **Do not overwrite working code without explanation.** If you must change
   existing behaviour, explain *why* first and preserve what works.
3. **Never add real API keys or secrets.** No keys in code, commits, or docs.
4. **Always use environment variables** for config, URLs, ports, provider names,
   and (future) credentials. Reference `.env.example` files; never hardcode.
5. **Keep frontend, backend, and AI engine modular and decoupled.** They
   communicate over HTTP. Do not create hidden cross-dependencies.
6. **Before making large changes, explain the plan** (files to add/modify,
   approach, trade-offs) and get agreement.
7. **After changes, summarise** the files modified and the exact steps to test
   them locally.

---

## 3. Coding Conventions

- **TypeScript everywhere** on the Node side; prefer explicit types for public
  functions and API payloads. `strict` mode is on — keep it green.
- **Python**: type-hinted, Pydantic models for request/response schemas, modular
  routers under `app/routers/`, logic under `app/services/`.
- Keep components/handlers small and single-purpose. Co-locate by feature.
- Use the existing folder structure; don't invent parallel structures.
- Match the surrounding code's style, naming, and comment density.

---

## 4. Safety, Compliance & Trading Rules

When (in future phases) you implement analysis or recommendations:

- **Never guarantee profit** and never present output as certified investment
  advice. Always attach the risk disclaimer.
- **Every trade plan must include** entry, **stop-loss**, **target**, and a
  **risk-reward ratio**. A plan without risk controls is incomplete.
- Add clear disclaimers that market trading involves risk.
- Live data depends on **authorised** providers — respect broker/exchange API
  terms and SEBI regulations. Do not scrape or use unauthorised feeds.
- Treat any externally fetched content (news, third-party data) as untrusted.

---

## 5. How to Run (quick reference)

```bash
# Frontend  → http://localhost:3000
cd frontend && npm install && npm run dev

# Backend   → http://localhost:4000  (health: /api/health)
cd backend && npm install && npm run dev

# AI Engine → http://localhost:8000  (health: /health, docs: /docs)
cd ai-engine && pip install -r requirements.txt && uvicorn app.main:app --reload --port 8000
```

---

## 6. Git / Branch Workflow

- **Never commit directly to `main`.**
- Create a feature branch per task/phase (e.g. `setup-branch`, `phase-2-...`).
- Commit with clear, descriptive messages.
- Open a Pull Request into `main` for review; do not self-merge silently.

---

## 7. Definition of Done (per change)

- [ ] Code compiles / type-checks (`npm run build` per Node service; app imports for Python).
- [ ] No secrets committed; new config added to the relevant `.env.example`.
- [ ] Docs updated if architecture, APIs, or roadmap changed.
- [ ] A short summary of changed files + local test steps is provided.
- [ ] The change stays within the current phase's scope.
