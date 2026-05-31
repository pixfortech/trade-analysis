# AI Share Market Analysis Tool

An AI-powered analysis platform for the **Indian share market**. It is being
built to assist with research and decision-support across multiple market
segments — **not** to provide guaranteed profit or certified investment advice.

> ⚠️ **Phase 1 (Initial Setup) only.** This repository currently contains a
> clean, scalable, runnable foundation. There is **no live market data**, **no
> broker integration**, and **no real AI** wired up yet. All data shown is
> mock/placeholder data for UI demonstration.

---

## 📌 Project Overview

| | |
|---|---|
| **Goal** | Production-ready monorepo foundation for an AI Indian-market analysis tool |
| **Target market** | Indian stock market (NSE / BSE) |
| **Current phase** | Phase 1 — Initial Repository Setup |

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

---

## 🌿 Branch Workflow

- `main` — protected. **No direct commits.**
- `setup-branch` — Phase 1 foundation work (this branch).

All work for this phase lives on `setup-branch`. To merge it into `main`, open a
Pull Request (see **How to Later Merge** in the project notes / final summary).
Future phases should follow the same pattern: branch → build → PR → review →
merge.

---

## 🗺️ Next Phase Plan

**Phase 2 — Core API & UI wiring:** connect the frontend to the backend, replace
mock JSON with structured contracts, and flesh out the AI-engine placeholder
logic. See [`docs/DEVELOPMENT_ROADMAP.md`](docs/DEVELOPMENT_ROADMAP.md) for the
full phased plan, and
[`docs/MARKET_DATA_INTEGRATION.md`](docs/MARKET_DATA_INTEGRATION.md) for how
authorised data providers (Zerodha Kite Connect, Upstox, Dhan, Angel One
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
