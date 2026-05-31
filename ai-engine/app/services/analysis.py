"""Placeholder analysis logic (Phase 2).

Returns realistic but clearly-labelled MOCK/DEMO data. No external AI or live
market calls are made. Output is deterministic per symbol so the UI is stable.
Replace these functions with real indicators / OI / options analytics and AI
scoring in later phases.
"""

from app.models.schemas import (
    AnalysisResponse,
    EquityRequest,
    FuturesRequest,
    OptionsRequest,
    TradePlanRequest,
    TradePlanResponse,
)


def _seed(symbol: str) -> int:
    """Deterministic non-negative integer derived from a symbol."""
    value = 0
    for ch in symbol.upper():
        value = (value * 31 + ord(ch)) % 100000
    return value


def _base_price(symbol: str) -> float:
    return round(500 + (_seed(symbol) % 3500) + 0.5, 2)


def _signal(symbol: str) -> str:
    return ["bullish", "bearish", "neutral"][_seed(symbol) % 3]


def analyse_equity(req: EquityRequest) -> AnalysisResponse:
    sym = req.symbol.upper()
    seed = _seed(sym)
    signal = _signal(sym)
    macd = (
        "bullish_crossover"
        if signal == "bullish"
        else "bearish_crossover"
        if signal == "bearish"
        else "flat"
    )
    return AnalysisResponse(
        symbol=sym,
        segment="equity",
        signal=signal,
        score=round((seed % 100) / 100, 2),
        notes=[
            "DEMO equity analysis from deterministic mock data — not live analysis.",
            f"Interval requested: {req.interval}.",
        ],
        metrics={
            "rsi": round(40 + (seed % 30), 2),
            "macd": macd,
            "ema20": round(_base_price(sym) * 0.999, 2),
            "ema50": round(_base_price(sym) * 0.985, 2),
        },
    )


def analyse_futures(req: FuturesRequest) -> AnalysisResponse:
    sym = req.symbol.upper()
    seed = _seed(sym)
    signal = _signal(sym)
    interpretation = (
        "long_buildup"
        if signal == "bullish"
        else "short_buildup"
        if signal == "bearish"
        else "neutral"
    )
    return AnalysisResponse(
        symbol=sym,
        segment="index_future",
        signal=signal,
        score=round((seed % 100) / 100, 2),
        notes=["DEMO futures analysis from mock data — not live analysis."],
        metrics={
            "expiry": req.expiry,
            "basis": round((seed % 80) - 40 + 0.5, 2),
            "oiChangePercent": round(((seed % 200) - 100) / 10, 2),
            "interpretation": interpretation,
        },
    )


def analyse_options(req: OptionsRequest) -> AnalysisResponse:
    sym = req.symbol.upper()
    seed = _seed(sym)
    spot = _base_price(sym)
    return AnalysisResponse(
        symbol=sym,
        segment="index_option",
        signal=_signal(sym),
        score=round((seed % 100) / 100, 2),
        notes=["DEMO options analysis from mock data — not live analysis."],
        metrics={
            "expiry": req.expiry,
            "spot": spot,
            "pcr": round(0.6 + (seed % 80) / 100, 2),
            "maxPain": round(spot / 100) * 100,
            "support": [round(spot * 0.99, 2), round(spot * 0.98, 2)],
            "resistance": [round(spot * 1.01, 2), round(spot * 1.02, 2)],
        },
    )


def generate_trade_plan(req: TradePlanRequest) -> TradePlanResponse:
    # A demo plan, but it still respects the project rule that every plan
    # includes entry, stop-loss, target and a risk-reward ratio.
    sym = req.symbol.upper()
    signal = _signal(sym)
    base = _base_price(sym)
    action = "BUY" if signal == "bullish" else "SELL" if signal == "bearish" else "HOLD"
    long_side = action != "SELL"
    entry = base
    stop_loss = round(base * (0.985 if long_side else 1.015), 2)
    target = round(base * (1.03 if long_side else 0.97), 2)
    risk_reward = round(abs(target - entry) / abs(entry - stop_loss), 2)
    confidence = round(55 + (_seed(sym) % 25), 2)
    return TradePlanResponse(
        symbol=sym,
        segment=req.segment,
        action=action,
        signal=signal,
        confidence=confidence,
        entry=entry,
        stop_loss=stop_loss,
        target=target,
        risk_reward=risk_reward,
        rationale=[
            "DEMO trade plan from deterministic mock data — no live market data is used.",
            f"Derived a {signal} bias for {sym}; position size must respect the stop-loss.",
            f"Inputs: capital={req.capital}, riskPercent={req.risk_percent}.",
        ],
    )
