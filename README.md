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

## 📡 Live Data (Zerodha Kite, read-only · Phase 3A)

An **optional, read-only** Zerodha Kite Connect integration is included. It is
**disabled by default** and makes no external calls until you opt in with your
**own authorised** Kite developer credentials. It provides connection status,
login, live quotes and historical candles — and **nothing else**: there is **no**
order placement, modification, cancellation, GTT, basket or trade execution.

**1. Get credentials** from your own account at <https://developers.kite.trade/>
and register a redirect URL (e.g. `http://localhost:4000/api/kite/callback`).

**2. Configure the backend** (`backend/.env` — never commit it):
```bash
KITE_ENABLE_LIVE_DATA=true
KITE_API_KEY=your_api_key            # public (appears in the login URL)
KITE_API_SECRET=your_api_secret      # SERVER-SIDE ONLY — never exposed/committed
KITE_REDIRECT_URL=http://localhost:4000/api/kite/callback
```

**3. Run backend + frontend**, open the dashboard, and use the **“Live Data —
Zerodha Kite”** card:
- Click **Connect Kite** → authorise in Zerodha’s official login (new tab).
- You’re redirected to `/api/kite/callback`; the backend exchanges the
  `request_token` for an access token **stored server-side only**.
- Return to the dashboard, refresh status, and use the **read-only quote test**
  (e.g. `NSE:RELIANCE`).

**Security notes:**
- `KITE_API_SECRET` and the access token **never** reach the browser and are
  **never logged**. The `/api/kite/status` endpoint returns booleans only.
- The access token lives **in memory** in the backend; restarting it requires
  logging in again. Tokens are not written to the repo.
- Keep `KITE_ENABLE_LIVE_DATA=false` to run fully on mock data.

See [`docs/MARKET_DATA_INTEGRATION.md`](docs/MARKET_DATA_INTEGRATION.md) §7 for
endpoints and the security model.

### Instrument search, F&O resolver & dashboard customisation (Phase 3C–3D)

Once Kite is authorised, **refresh the instruments cache** (Live Data card, or
`POST /api/kite/instruments/refresh`). Then:

- **Search like Zerodha** in the Live Market Signal / Watchlist search box — type
  `RELIANCE`, `MIDCPNIFTY FUT`, or `NIFTY 24500 CE` and pick from grouped
  results (Equity / Indices / Futures / Options). You never need to know exact
  symbols like `NFO:MIDCPNIFTY26JUNFUT`.
- **Watchlist:** add/remove instruments; live LTP shows when Kite is authorised
  (via the batch-quote endpoint). Saved in your browser (`localStorage`).
- **Customise the dashboard:** click **Customise** to show/hide and reorder
  cards, or reset to default. Your layout persists in `localStorage`.

**Instruments cache is local:** it is written to `backend/.cache/` (gitignored)
with a **24h TTL** (`KITE_INSTRUMENTS_TTL_HOURS`) and auto-refreshes when stale.
**Do not commit `backend/.cache/`.** Everything here is **read-only** — there is
no order placement or trade execution anywhere in the app.

### Live Market Signal (Phase 3E)

The home page's primary card is **Live Market Signal**. Search/select an
instrument, choose an interval (default `5minute`) and risk profile, then
**Analyze** to get, from live Kite data:

- **Trend** (direction + strength) and a **bullish % / bearish %** split.
- An **estimated win %** — deliberately conservative and **capped** (never shown
  above ~75% unless every confirmation strongly aligns).
- **Long** and **short** setups: entry, stop-loss, Target 1/2/3, partial/full
  exit, risk-reward, and **tentative profit/loss per lot**.
- A **final decision**: `LONG / SHORT / WAIT / AVOID` with an invalidation level.

> **How probabilities are estimated:** a transparent score counts aligned
> signals (EMA9 vs EMA20, price vs EMA9/VWAP, RSI, MACD histogram, support/
> resistance breaks, price vs previous close). Agreement nudges the bull/bear
> split from 50/50; conflicting signals and thin/low-volume data lower
> confidence and the win estimate. **All probabilities and P/L are estimates,
> not guarantees.** With only a quote (no candle history) the signal stays
> low-confidence and returns **WAIT**.

**Default dashboard (Phase 3F):** the most useful cards show by default —
**Live Market Signal (with chart), Active Trade Monitor, Watchlist, Zerodha Kite
Status, Risk Management**. Enable Market Overview, AI Recommendation,
Futures/Options Analysis, Scanner or Raw Kite Data from **Customise**. Hidden
cards are fully removed (not just collapsed), and your choice persists in
`localStorage`. Use **Reset** to restore defaults.

### Real-time chart, indicators & trade alerts (Phase 3F)

- **Live chart:** the Live Market Signal card renders a candlestick chart
  (lightweight-charts) with active overlays (VWAP, EMA20, EMA50, Supertrend) and
  entry/SL/target price lines. Timeframes: 1m/3m/5m/15m/30m/60m (default 5m).
- **Indicator engine & toggles:** default indicators are **VWAP, EMA20, EMA50,
  RSI14, MACD, ADX(+DI/−DI), ATR, Supertrend, Volume and OI** (OI only when Kite
  provides it — never faked). Toggle any indicator and the trend, probability,
  entry/exit and decision **recalculate immediately** using only active
  indicators. A contribution table shows each indicator's direction & weight.
- **Real-time updates:** click **Start live updates** to poll every 5s
  (read-only). The JSON spec's WebSocket is intentionally deferred in favour of
  polling for stability; nothing here places orders.
- **Long & short P/L are calculated SEPARATELY.** Long uses
  `(target − entry) × qty` profit / `(entry − stop) × qty` loss; short uses the
  mirror. Stops are structure-aware (long = recent swing low, short = swing
  high), so the two sides have genuinely different risk and P/L. If they ever
  look close, it's because the risk distances are similar — not a placeholder.
- **Active Trade Monitor:** enter a manual position (direction, entry, qty) and
  it shows current P/L, trailing stop, **best exit for least loss**, an
  opposite **re-entry plan**, and a recommended action — **HOLD / TIGHTEN_SL /
  EXIT_NOW / PARTIAL_EXIT / REVERSE_SETUP / WAIT_FOR_REENTRY**.
- **Trend reversal alerts:** when the trend flips bullish↔bearish (or the
  monitor says exit/tighten), an in-app toast fires; enable **browser alerts**
  for desktop notifications. Alerts have a cooldown to avoid spam and are
  **advisory only** — the app never trades for you.

> **All outputs are estimates, not guaranteed profit advice.** Probabilities are
> capped conservatively (35–75%). If data is insufficient the signal returns
> **WAIT** rather than forcing a trade. The app is fully **read-only**: no order
> placement, modification, cancellation, GTT or basket orders anywhere.

### Paper trading, account data, widgets & theme (Phase 3G)

- **Paper Trading (simulated only):** open **Paper Buy / Long** or **Paper Sell /
  Short** positions from any instrument. Entries use a live or manual price;
  unrealised P/L marks-to-market against live quotes (5s polling) and realised
  P/L is computed on exit. **No real Zerodha order is ever placed** — there are
  no real Buy/Sell buttons anywhere. Multiple simultaneous trades, partial/full
  Paper Exit, and Reset are supported. Paper P/L:
  - long: `(current − entry) × qty` (unrealised), `(exit − entry) × qty` (realised)
  - short: `(entry − current) × qty` (unrealised), `(entry − exit) × qty` (realised)
- **Zerodha account data (read-only):** the Account widget shows funds, margins,
  holdings value and positions P/L **where your Kite app permits**. If an
  endpoint isn't available, it shows a clear "unavailable" message — **never fake
  data**. Endpoints: `/api/kite/account/{profile,funds,margins,holdings,positions,portfolio-summary}`.
- **Risk Management (dynamic):** uses your **live Zerodha capital** when
  available, or a **manual capital override**; pick a risk % (0.25–2%) and it
  computes risk/trade, per-unit/per-lot risk and max paper position size.
  Settings persist in `localStorage`.
- **Market Status:** real NSE session state in IST (open / pre-open / closed /
  post-close / weekend) with next open/close — no static label. Exchange
  holidays aren't in the calendar yet (`holidayStatus: unknown`).
- **Top Performers:** gainers/losers tabs for Indices / Equity / Futures /
  Options using a **bounded** instrument set (curated large-caps + nearest
  expiry) to respect Kite rate limits; `partialData` is flagged when the scan is
  limited.
- **Resizable widgets:** every card is an optional widget with **Small / Medium /
  Large / Full-width** size presets and up/down reordering via **Customise**;
  layout (visibility + order + size) persists in `localStorage`. Widgets stack
  cleanly on mobile.
- **Light / dark theme:** toggle in the header (defaults to dark); persists in
  `localStorage`.

> Paper trading is **simulation only** for learning — it never connects to
> Zerodha order APIs. Account data is **read-only**. Real trading execution is
> disabled everywhere.

### Troubleshooting: search returns nothing

1. **Enable Kite:** set `KITE_ENABLE_LIVE_DATA=true` + `KITE_API_KEY` in
   `backend/.env`, then restart the backend. (Search uses Kite's **public**
   instruments dump, so it works **before** you complete the login — you only
   need login for live quotes/signals.)
2. **Refresh the cache:** `POST /api/kite/instruments/refresh` or the Kite Status
   card. Check `GET /api/kite/instruments/status` shows `ready: true`.
3. **Type at least 2 characters.** Results are grouped; if empty, the response
   includes a helpful message.
4. The cache auto-refreshes on first use / after the 24h TTL.

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
