"""
Training script for NourishNet Surplus Prediction Model.

Algorithm: GradientBoostingRegressor from scikit-learn
Serialization: joblib (pinned joblib==1.4.2 & scikit-learn==1.6.1)
"""

import os
import csv
import joblib
import numpy as np
from sklearn.ensemble import GradientBoostingRegressor
from sklearn.model_selection import train_test_split
from sklearn.metrics import mean_absolute_error, r2_score

from app.ml.seed_data import generate_seed_data, SEED_FILE_PATH

MODEL_PATH = os.path.join(os.path.dirname(__file__), "surplus_model.joblib")


def train_and_serialize_model() -> dict:
    """Train the surplus prediction model and serialize with joblib."""
    if not os.path.exists(SEED_FILE_PATH):
        generate_seed_data(num_samples=800)

    X = []
    y = []

    with open(SEED_FILE_PATH, mode="r", encoding="utf-8") as f:
        reader = csv.DictReader(f)
        for row in reader:
            # Features: [donor_id, day_of_week, hour_of_day, past_avg_quantity]
            X.append([
                float(row["donor_id"]),
                float(row["day_of_week"]),
                float(row["hour_of_day"]),
                float(row["past_avg_quantity"]),
            ])
            y.append(float(row["surplus_quantity"]))

    X = np.array(X)
    y = np.array(y)

    X_train, X_test, y_train, y_test = train_test_split(
        X, y, test_size=0.2, random_state=42
    )

    # GradientBoostingRegressor provides robust non-linear modeling for temporal/donor interactions
    model = GradientBoostingRegressor(
        n_estimators=70,
        learning_rate=0.1,
        max_depth=3,
        random_state=42,
    )
    model.fit(X_train, y_train)

    predictions = model.predict(X_test)
    mae = mean_absolute_error(y_test, predictions)
    r2 = r2_score(y_test, predictions)

    # Bundle model with metadata and cold-start default value
    model_bundle = {
        "model": model,
        "algorithm": "GradientBoostingRegressor",
        "sklearn_version": "1.6.1",
        "joblib_version": "1.4.2",
        "feature_names": ["donor_id", "day_of_week", "hour_of_day", "past_avg_quantity"],
        "metrics": {"mae": round(float(mae), 3), "r2": round(float(r2), 3)},
        # Documented regional baseline for cold start (when donor has no historical activity)
        "cold_start_default_kg": 15.0,
    }

    joblib.dump(model_bundle, MODEL_PATH)
    print(f"Model successfully trained & serialized to: {MODEL_PATH}")
    print(f"Evaluation: MAE = {mae:.2f} kg, R^2 = {r2:.3f}")
    return model_bundle


if __name__ == "__main__":
    train_and_serialize_model()
