"""
Inference engine for NourishNet Surplus Prediction.

Loads the serialized scikit-learn model and provides predictions with
explicit cold-start fallback handling.
"""

import os
from datetime import datetime
import joblib
import numpy as np
from sqlalchemy.orm import Session
from sqlalchemy import func

from app.models.donation import Donation
from app.ml.train import MODEL_PATH, train_and_serialize_model

_model_cache = None


def get_model():
    """Load or train and cache the model artifact."""
    global _model_cache
    if _model_cache is not None:
        return _model_cache

    if not os.path.exists(MODEL_PATH):
        train_and_serialize_model()

    _model_cache = joblib.load(MODEL_PATH)
    return _model_cache


def predict_donor_surplus(
    donor_id: int,
    db: Session,
    target_datetime: datetime | None = None,
) -> dict:
    """
    Predict expected surplus food for a given donor.

    Cold-start policy:
    If the donor has no donation history in the database, returns the
    documented default baseline without throwing a 500 error.
    """
    bundle = get_model()
    model = bundle["model"]
    default_kg = bundle["cold_start_default_kg"]

    dt = target_datetime or datetime.now()
    day_of_week = dt.weekday()
    hour_of_day = dt.hour

    # Query donor's historical donation statistics
    history_stats = (
        db.query(
            func.count(Donation.id).label("total_count"),
            func.avg(Donation.quantity).label("avg_quantity"),
        )
        .filter(Donation.donor_id == donor_id)
        .first()
    )

    donation_count = history_stats.total_count if history_stats else 0
    avg_quantity = float(history_stats.avg_quantity) if history_stats and history_stats.avg_quantity else 0.0

    # Cold start case: no historical activity
    if donation_count == 0:
        return {
            "donor_id": donor_id,
            "predicted_surplus_kg": default_kg,
            "confidence": 0.45,
            "model_status": "cold_start_default",
            "historical_donations_count": 0,
            "target_time": dt.isoformat(),
            "algorithm": bundle["algorithm"],
            "message": (
                f"No previous donation history recorded for donor {donor_id}. "
                f"Returned default regional baseline surplus estimate ({default_kg} kg)."
            ),
        }

    # Trained prediction using historical pattern
    features = np.array([[float(donor_id % 10 or 1), float(day_of_week), float(hour_of_day), avg_quantity]])
    pred = model.predict(features)[0]
    predicted_kg = round(max(1.0, float(pred)), 2)

    confidence = min(0.95, 0.65 + (donation_count * 0.03))

    return {
        "donor_id": donor_id,
        "predicted_surplus_kg": predicted_kg,
        "confidence": round(confidence, 2),
        "model_status": "trained_prediction",
        "historical_donations_count": donation_count,
        "historical_avg_kg": round(avg_quantity, 2),
        "target_time": dt.isoformat(),
        "algorithm": bundle["algorithm"],
        "message": (
            f"Successfully predicted expected surplus based on {donation_count} past donation(s) "
            f"and temporal signals (Day {day_of_week}, Hour {hour_of_day}:00)."
        ),
    }
