"""
Predictions Router — ML food surplus forecasting endpoint.
"""

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.user import User, UserRole
from app.ml.predictor import predict_donor_surplus

router = APIRouter(prefix="/predictions", tags=["predictions"])


class PredictionResponse(BaseModel):
    donor_id: int
    predicted_surplus_kg: float
    confidence: float
    model_status: str
    historical_donations_count: int
    target_time: str
    algorithm: str
    message: str


@router.get("/{donor_id}", response_model=PredictionResponse)
def get_donor_surplus_prediction(
    donor_id: int,
    db: Session = Depends(get_db),
):
    """
    Predict surplus food quantity for a donor.

    Explicitly handles cold-start: if donor has no historical records,
    returns documented default expectation (15.0 kg) with status 'cold_start_default'
    without failing or throwing a 500.
    """
    # Verify donor exists in user registry
    donor = db.query(User).filter(User.id == donor_id).first()
    if not donor:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Donor with ID {donor_id} not found",
        )

    prediction = predict_donor_surplus(donor_id=donor_id, db=db)
    return prediction
