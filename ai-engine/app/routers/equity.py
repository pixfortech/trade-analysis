from fastapi import APIRouter

from app.models.schemas import AnalysisResponse, EquityRequest
from app.services import analysis

router = APIRouter(prefix="/analyse", tags=["analysis"])


@router.post("/equity", response_model=AnalysisResponse)
def analyse_equity(payload: EquityRequest) -> AnalysisResponse:
    return analysis.analyse_equity(payload)
