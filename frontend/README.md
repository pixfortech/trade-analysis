# Frontend — AI Share Market Analysis Tool

Premium **dark-mode** trading dashboard built with **Next.js (App Router),
React, TypeScript, and Tailwind CSS**.

> Phase 1: renders **mock/placeholder data only**. No real market or AI calls.

## Run

```bash
npm install      # first time only
npm run dev      # http://localhost:3000
```

## Build

```bash
npm run build && npm run start
```

## Structure

```
src/
├── app/                 # layout.tsx, page.tsx (dashboard), globals.css
├── components/
│   ├── layout/          # Sidebar, Header
│   ├── ui/              # Card, Badge, SignalPill, Stat, Sparkline
│   └── dashboard/       # 10 dashboard sections
├── lib/                 # mockData.ts, format.ts
└── types/               # shared types
```

## Environment

Copy `.env.local.example` → `.env.local`. Only `NEXT_PUBLIC_*` vars reach the
browser. The backend URL defaults to `http://localhost:4000`.
