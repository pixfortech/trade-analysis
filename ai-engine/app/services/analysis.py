"""Placeholder analysis logic (Phase 1).

Everything here returns deterministic sample data so the service is runnable
without any AI provider or live market feed. Replace these functions with real
technical / futures / options analytics and AI scoring in later phases.
"""

from app.models.schemas import (
    AnalysisResponse,
    EquityRequest,
    FuturesRequest,
    OptionsRequest,
    TradePlanRequest,
    TradePlanResponse,
)


def analyse_equity(req: EquityRequest) -> AnalysisResponse:
    return AnalysisResponse(
        symbol=req.symbol.upper(),
        segment="equity",
        signal="neutral",
        score=0.0,
        notes=["Placeholder equity analysis — add real indicators later."],
        metrics={"interval": req.interval, "rsi": None, "macd": None},
    )


def analyse_futures(req: FuturesRequest) -> AnalysisResponse:
    return AnalysisResponse(
        symbol=req.symbol.upper(),
        segment="index_future",
        signal="bullish",
        score=0.0,
        notes=["Placeholder futures analysis — add basis/OI logic later."],
        metrics={"expiry": req.expiry, "basis": None, "oiChangePercent": None},
    )


def analyse_options(req: OptionsRequest) -> AnalysisResponse:
    return AnalysisResponse(
        symbol=req.symbol.upper(),
        segment="index_option",
        signal="neutral",
        score=0.0,
        notes=["Placeholder options analysis — add chain/PCR/max-pain later."],
        metrics={"expiry": req.expiry, "pcr": None, "maxPain": None},
    )


def generate_trade_plan(req: TradePlanRequest) -> TradePlanResponse:
    # NOTE: a real plan MUST include entry, stop-loss, target and risk-reward.
    # Placeholder returns HOLD with no levels until the scoring engine exists.
    return TradePlanResponse(
        symbol=req.symbol.upper(),
        segment=req.segment,
        action="HOLD",
        signal="neutral",
        confidence=0.0,
        entry=None,
        stop_loss=None,
        target=None,
        risk_reward=None,
        rationale=[
            "Placeholder trade plan — no live signal generated in Phase 1.",
            f"Received capital={req.capital}, riskPercent={req.risk_percent}.",
        ],
    )
