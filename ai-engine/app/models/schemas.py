"""Pydantic request/response models for the AI engine.

Field names are snake_case in Python but (de)serialised as camelCase so the
Node backend and JSON clients see camelCase keys (e.g. ``stopLoss``).

Phase 2: responses are MOCK/DEMO data (``source="mock"``, ``demo=True``).
"""

from typing import Any, Literal, Optional

from pydantic import BaseModel, ConfigDict
from pydantic.alias_generators import to_camel

Signal = Literal["bullish", "bearish", "neutral"]
Action = Literal["BUY", "SELL", "HOLD"]
Source = Literal["ai-engine", "mock", "mock-fallback"]

DISCLAIMER = (
    "Educational use only. Not investment advice. "
    "Trading involves risk of loss. Live data depends on authorised API providers. "
    "Data is mock/demo until authorised live market data is integrated."
)


class CamelModel(BaseModel):
    """Base model: accept snake_case or camelCase input, emit camelCase output."""

    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True)


# --------------------------- Requests ---------------------------
class EquityRequest(CamelModel):
    symbol: str
    interval: str = "1d"


class FuturesRequest(CamelModel):
    symbol: str
    expiry: Optional[str] = None


class OptionsRequest(CamelModel):
    symbol: str
    expiry: Optional[str] = None


class TradePlanRequest(CamelModel):
    symbol: str
    segment: str = "equity"
    capital: float = 100000.0
    risk_percent: float = 1.0


# --------------------------- Responses ---------------------------
class HealthResponse(CamelModel):
    status: str = "ok"
    service: str = "ai-engine"
    version: str = "0.1.0"


class AnalysisResponse(CamelModel):
    source: Source = "mock"
    demo: bool = True
    symbol: str
    segment: str
    signal: Signal = "neutral"
    score: float = 0.0  # placeholder 0..1 confidence/score
    notes: list[str] = []
    metrics: dict[str, Any] = {}
    disclaimer: str = DISCLAIMER


class TradePlanResponse(CamelModel):
    source: Source = "mock"
    demo: bool = True
    symbol: str
    segment: str
    action: Action = "HOLD"
    signal: Signal = "neutral"
    confidence: float = 0.0
    entry: Optional[float] = None
    stop_loss: Optional[float] = None
    target: Optional[float] = None
    risk_reward: Optional[float] = None
    rationale: list[str] = []
    disclaimer: str = DISCLAIMER
