# AI Engine — AI Share Market Analysis Tool

**Python + FastAPI** analysis service. In Phase 1 every endpoint returns
**placeholder** results — no real AI calls and no live market data.

## Run

```bash
python -m venv venv
source venv/bin/activate          # Windows: venv\Scripts\activate
pip install -r requirements.txt
cp .env.example .env              # first time only

uvicorn app.main:app --reload --port 8000
```

- Health: http://localhost:8000/health
- Interactive API docs (Swagger): http://localhost:8000/docs
- Alternative docs (ReDoc): http://localhost:8000/redoc

## Endpoints

| Method | Path | Purpose |
|---|---|---|
| GET | `/health` | Engine health check |
| POST | `/analyse/equity` | Placeholder equity analysis |
| POST | `/analyse/futures` | Placeholder futures analysis |
| POST | `/analyse/options` | Placeholder options analysis |
| POST | `/analyse/trade-plan` | Placeholder trade-plan generation |

Quick test:

```bash
curl http://localhost:8000/health
curl -X POST http://localhost:8000/analyse/equity \
  -H "Content-Type: application/json" -d '{"symbol":"TCS","interval":"1d"}'
```

## Structure

```
app/
├── main.py              # FastAPI app, CORS, router registration
├── config.py            # settings from environment
├── routers/             # health, equity, futures, options, trade_plan
├── models/schemas.py    # Pydantic request/response models
└── services/analysis.py # placeholder analysis logic (extend later)
```

## Extending later
Add real indicator math, futures/options analytics, and AI scoring inside
`app/services/`. Keep request/response shapes in `app/models/schemas.py` so the
backend contract stays stable.
