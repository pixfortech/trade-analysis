from fastapi import APIRouter

from app.models.schemas import TradePlanRequest, TradePlanResponse
from app.services import analysis

router = APIRouter(prefix="/analyse", tags=["analysis"])


@router.post("/trade-plan", response_model=TradePlanResponse)
def generate_trade_plan(payload: TradePlanRequest) -> TradePlanResponse:
    return analysis.generate_trade_plan(payload)
