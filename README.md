# AI Share Market Analysis Tool

An AI-powered analysis platform for the **Indian share market**. It is being
built to assist with research and decision-support across multiple market
segments — **not** to provide guaranteed profit or certified investment advice.

> ⚠️ **Phases 1–2 (foundation + service wiring).** This repository contains a
> clean, scalable, runnable foundation **with the three services wired together**
> (frontend → backend → AI engine). There is still **no live market data**, **no
> broker integration**, and **no real AI** — all data is **mock/demo** for UI and
> integration demonstration.

---

## 📌 Project Overview

| | |
|---|---|
| **Goal** | Production-ready monorepo foundation for an AI Indian-market analysis tool |
| **Target market** | Indian stock market (NSE / BSE) |
| **Current phase** | Phase 2 — Service Wiring, CI & Stable Foundation (mock/demo data) |

### Supported segments (planned)
- Equity (Cash)
- Stock Futures
- Index Futures
- Stock Options
- Index Options
- Nifty 50
- Bank Nifty
- Fin Nifty

### Future capabilities (later phases)
Live market data integration · Technical analysis · Futures analysis · Options
chain & open-interest analysis · AI-based trade recommendations · Best entry/exit
levels · Stop-loss & target calculation · Risk management · Position tracking ·
Scanner · Alerts.

---

## 📁 Folder Structure

```
trade-analysis/
├── frontend/        # Next.js + React + TypeScript + Tailwind dashboard (dark mode)
├── backend/         # Node.js + Express + TypeScript API server
├── ai-engine/       # Python + FastAPI analysis service (placeholder logic)
├── docs/            # Architecture, API design, roadmap, data-integration docs
├── README.md        # This file
├── CLAUDE.md        # Instructions for AI assistants / future development
├── .gitignore
├── .env.example     # Master environment-variable reference (no real secrets)
└── package.json     # Root convenience scripts (dev/build orchestration)
```

See [`docs/PROJECT_ARCHITECTURE.md`](docs/PROJECT_ARCHITECTURE.md) for the full
breakdown and data-flow diagram.

### Data flow (Phase 2)

```
Browser ──▶ Frontend (Next.js)
              │  typed API client (NEXT_PUBLIC_BACKEND_URL)
              ▼
            Backend (Express)  ──▶  AI Engine (FastAPI)
              │   service layer (AI_ENGINE_URL)
              │   if the engine is unreachable, the backend returns
              ▼   clearly-marked mock-fallback data so the app still works
            JSON response (camelCase, carries `source` + `demo` flags + disclaimer)
```

---

## 🧰 Technology Stack

| Layer | Tech |
|---|---|
| **Frontend** | Next.js (App Router), React, TypeScript, Tailwind CSS |
| **Backend** | Node.js, Express.js, TypeScript |
| **AI Engine** | Python, FastAPI, Pydantic, Uvicorn |
| **Tooling** | npm, tsx, concurrently |

---

## ✅ Prerequisites

- **Node.js** ≥ 18.18 (LTS recommended) and npm
- **Python** ≥ 3.10 and pip
- **git**

---

## ⚙️ Environment Setup

Each service reads its own environment file. Start by copying the examples:

```bash
# From the repository root
cp .env.example .env                       # master reference
cp frontend/.env.local.example frontend/.env.local
cp backend/.env.example backend/.env
cp ai-engine/.env.example ai-engine/.env
```

Default local ports:

| Service | URL |
|---|---|
| Frontend | http://localhost:3000 |
| Backend | http://localhost:4000 |
| AI Engine | http://localhost:8000 |

> 🔒 **Never commit real secrets.** Only `*.example` files are tracked; real
> `.env` files are git-ignored.

---

## 📦 Install Dependencies

```bash
# Node services (frontend + backend) — from the repo root
npm run install:all

# Python AI engine
cd ai-engine
python -m venv venv
source venv/bin/activate        # Windows: venv\Scripts\activate
pip install -r requirements.txt
cd ..
```

---

## ▶️ How to Run

### Run everything (frontend + backend together)
```bash
npm run dev
```
Then start the AI engine in a separate terminal (see below).

### How to run the Frontend
```bash
cd frontend
npm install        # first time only
npm run dev
# open http://localhost:3000
```

### How to run the Backend
```bash
cd backend
npm install        # first time only
npm run dev
# API on http://localhost:4000  (try GET http://localhost:4000/api/health)
```

### How to run the AI Engine
```bash
cd ai-engine
python -m venv venv && source venv/bin/activate   # first time only
pip install -r requirements.txt                    # first time only
uvicorn app.main:app --reload --port 8000
# docs on http://localhost:8000/docs  (try GET http://localhost:8000/health)
```

> Tip: run all three for the full flow. The backend works **without** the AI
> engine too — it returns `source: "mock-fallback"` data when the engine is off.

---

## ☁️ Running in GitHub Codespaces

In a Codespace each port is exposed at its own forwarded URL like
`https://<codespace-name>-3000.app.github.dev` — **not** `localhost`. Because
your browser runs on your own machine, calling `localhost:4000` from the page
would hit *your* laptop, not the Codespace. The app handles this automatically.

1. **Start the services** (separate terminals):
   ```bash
   cd backend  && npm install && npm run dev      # port 4000
   cd frontend && npm install && npm run dev      # port 3000
   cd ai-engine && source venv/bin/activate \
     && pip install -r requirements.txt \
     && uvicorn app.main:app --reload --port 8000 # port 8000 (optional)
   ```
2. **Forward / make ports visible.** In the **Ports** tab, ensure **3000** and
   **4000** are forwarded. Set **port 4000 to _Public_** (or keep it Private but
   authenticated in your browser) so the page can reach it.
3. **Open the frontend** via its forwarded `-3000.app.github.dev` URL and click
   **Analyze** in *Live Analysis*.

**How URLs resolve (no config needed):**
- The **frontend calls the backend on port 4000**. If `NEXT_PUBLIC_BACKEND_URL`
  is unset, it auto-derives the backend URL from the page origin — swapping
  `-3000.app.github.dev` → `-4000.app.github.dev` in Codespaces, or falling back
  to `http://localhost:4000` locally.
- The **backend calls the AI engine on port 8000** server-side. **Port 8000 does
  not need to be public** for frontend testing — only the backend reaches it.
- The browser **never** calls port 8000 directly.

**Notes:**
- To force a specific backend URL, set `NEXT_PUBLIC_BACKEND_URL` in
  `frontend/.env.local`. Because `NEXT_PUBLIC_*` values are inlined at build
  time, **restart the frontend dev server after changing `.env.local`**.
- In development the backend automatically allows `*.app.github.dev` origins
  (CORS); this wildcard is disabled when `NODE_ENV=production`.

---

## 🧪 How to Test

Each service has a lightweight check used locally and in CI.

```bash
# Frontend — type-check (no emit)
cd frontend && npm run typecheck

# Backend — type-check + unit tests (node:test)
cd backend && npm run typecheck && npm test

# AI Engine — import check (+ optional pytest suite)
cd ai-engine && source venv/bin/activate
python -c "from app.main import app; print('AI engine import OK')"
pip install -r requirements-dev.txt && pytest      # optional
```

CI (GitHub Actions, `.github/workflows/ci.yml`) runs on every **push to
`setup-branch`** and every **pull request to `main`**: it builds the frontend and
backend and import-checks the AI engine.

---

## 🌿 Branch Workflow

- `main` — **stable/protected.** No direct commits; updated only by the repo
  owner merging an approved Pull Request.
- `setup-branch` — **active development branch.** All current work (Phases 1–2
  and ongoing) is committed and pushed here.

Development happens on `setup-branch`. The owner merges `setup-branch` → `main`
via a Pull Request only after review and testing. Unless a new phase branch is
created, development continues on `setup-branch` after each merge.

---

## 🗺️ Next Phase Plan

**Phase 2 (in progress) — Service wiring, CI & stable foundation:** typed
frontend API client → backend, backend service layer → AI engine (with mock
fallback), shared response contracts, loading/error/empty UI states, basic tests
and CI. **Phase 3 next — authorised market-data integration.** See
[`docs/DEVELOPMENT_ROADMAP.md`](docs/DEVELOPMENT_ROADMAP.md) for the full phased
plan, and [`docs/MARKET_DATA_INTEGRATION.md`](docs/MARKET_DATA_INTEGRATION.md)
for how authorised data providers (Zerodha Kite Connect, Upstox, Dhan, Angel One
SmartAPI, TrueData, etc.) will be integrated later.

---

## ⚠️ Trading Risk Disclaimer

This software is provided for **educational and informational purposes only**.
It does **not** constitute investment, financial, or trading advice, and nothing
in it should be construed as a recommendation to buy or sell any security.

- Trading and investing in equities, futures, and options carry **substantial
  risk of loss** and are not suitable for every investor.
- **No output guarantees profit.** Past performance and any AI-generated signal
  do not guarantee future results.
- Every generated trade plan is a hypothesis and must be independently verified.
  Always consider stop-loss, target, and risk-reward before acting.
- **Live data depends on authorised API providers.** You are responsible for
  complying with all broker and exchange (NSE/BSE) API terms, licensing, and
  applicable regulations (incl. SEBI rules).

Use at your own risk. The authors accept no liability for any financial loss.

---

## 📄 License

MIT — see `LICENSE` (to be added).
