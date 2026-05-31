"""Basic API tests for the AI engine (Phase 2).

Run with:
    pip install -r requirements-dev.txt
    pytest
"""

from fastapi.testclient import TestClient

from app.main import app

client = TestClient(app)


def test_health_ok():
    res = client.get("/health")
    assert res.status_code == 200
    assert res.json()["status"] == "ok"


def test_equity_analysis_is_marked_demo():
    res = client.post("/analyse/equity", json={"symbol": "tcs", "interval": "1d"})
    assert res.status_code == 200
    body = res.json()
    assert body["symbol"] == "TCS"
    assert body["demo"] is True
    assert body["signal"] in {"bullish", "bearish", "neutral"}
    assert body["disclaimer"]


def test_trade_plan_includes_risk_controls():
    res = client.post("/analyse/trade-plan", json={"symbol": "RELIANCE", "segment": "equity"})
    assert res.status_code == 200
    body = res.json()
    assert body["stopLoss"] is not None
    assert body["target"] is not None
    assert body["riskReward"] is not None and body["riskReward"] > 0
    assert body["demo"] is True
    assert body["disclaimer"]
