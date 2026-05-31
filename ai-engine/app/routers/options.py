from fastapi import APIRouter

from app.models.schemas import AnalysisResponse, OptionsRequest
from app.services import analysis

router = APIRouter(prefix="/analyse", tags=["analysis"])


@router.post("/options", response_model=AnalysisResponse)
def analyse_options(payload: OptionsRequest) -> AnalysisResponse:
    return analysis.analyse_options(payload)
