"""FastAPI application entry point for the AI engine."""

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.config import get_settings
from app.routers import equity, futures, health, options, trade_plan

settings = get_settings()

app = FastAPI(
    title=settings.app_name,
    version=settings.version,
    description=(
        "Phase 1 placeholder analysis service for the AI Share Market Analysis "
        "Tool. Returns mock data only — no live market data or real AI calls. "
        "Educational use only; not investment advice."
    ),
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Register routers
app.include_router(health.router)
app.include_router(equity.router)
app.include_router(futures.router)
app.include_router(options.router)
app.include_router(trade_plan.router)


@app.get("/", tags=["root"])
def root() -> dict:
    return {
        "name": settings.app_name,
        "status": "ok",
        "phase": "Phase 1 (placeholder data)",
        "provider": settings.ai_provider,
        "docs": "/docs",
        "health": "/health",
    }
