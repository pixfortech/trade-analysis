from fastapi import APIRouter

from app.models.schemas import AnalysisResponse, FuturesRequest
from app.services import analysis

router = APIRouter(prefix="/analyse", tags=["analysis"])


@router.post("/futures", response_model=AnalysisResponse)
def analyse_futures(payload: FuturesRequest) -> AnalysisResponse:
    return analysis.analyse_futures(payload)
