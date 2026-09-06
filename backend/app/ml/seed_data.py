"""
Seed dataset generator for ML surplus prediction in NourishNet.

Generates historical food surplus donation records with features:
- donor_id: integer identifier of donor
- day_of_week: 0 (Monday) to 6 (Sunday)
- hour_of_day: 0 to 23 (peak surplus usually around 14:00 and 21:00)
- past_avg_quantity: average previous surplus (kg)
- target: surplus_quantity (kg)
"""

import os
import csv
import random

SEED_FILE_PATH = os.path.join(os.path.dirname(__file__), "data", "seed_donations.csv")


def generate_seed_data(num_samples: int = 600) -> str:
    """Generate synthetic historical donation data and save to CSV."""
    random.seed(42)
    os.makedirs(os.path.dirname(SEED_FILE_PATH), exist_ok=True)

    # Base characteristics for 10 simulated historical donors
    donor_profiles = {
        1: {"base_kg": 25.0, "weekend_boost": 10.0},  # Bakery
        2: {"base_kg": 40.0, "weekend_boost": 25.0},  # Banquet hall
        3: {"base_kg": 15.0, "weekend_boost": 5.0},   # Cafe
        4: {"base_kg": 50.0, "weekend_boost": 30.0},  # Hotel buffet
        5: {"base_kg": 30.0, "weekend_boost": 15.0},  # Supermarket
        6: {"base_kg": 10.0, "weekend_boost": 2.0},   # Small grocer
        7: {"base_kg": 35.0, "weekend_boost": 20.0},  # Corporate cafeteria
        8: {"base_kg": 20.0, "weekend_boost": 8.0},   # Fast food outlet
        9: {"base_kg": 45.0, "weekend_boost": 18.0},  # Catering service
        10: {"base_kg": 12.0, "weekend_boost": 4.0},  # Neighborhood bakery
    }

    fieldnames = ["donor_id", "day_of_week", "hour_of_day", "past_avg_quantity", "surplus_quantity"]

    with open(SEED_FILE_PATH, mode="w", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(f, fieldnames=fieldnames)
        writer.writeheader()

        for _ in range(num_samples):
            donor_id = random.randint(1, 10)
            profile = donor_profiles[donor_id]
            day_of_week = random.randint(0, 6)
            # Pick hours predominantly around afternoon (13-16) or closing (20-23)
            hour_of_day = random.choice([12, 13, 14, 15, 16, 19, 20, 21, 22])

            is_weekend = 1 if day_of_week in [4, 5, 6] else 0
            base = profile["base_kg"] + (profile["weekend_boost"] if is_weekend else 0)
            # Late night donations usually have slightly higher leftover surplus
            time_factor = 1.15 if hour_of_day >= 20 else 1.0

            noise = random.gauss(0, 2.5)
            surplus = max(2.0, round((base * time_factor) + noise, 2))
            past_avg = round(base + random.gauss(0, 1.5), 2)

            writer.writerow({
                "donor_id": donor_id,
                "day_of_week": day_of_week,
                "hour_of_day": hour_of_day,
                "past_avg_quantity": past_avg,
                "surplus_quantity": surplus,
            })

    print(f"Generated {num_samples} seed samples saved to: {SEED_FILE_PATH}")
    return SEED_FILE_PATH


if __name__ == "__main__":
    generate_seed_data()
