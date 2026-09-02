"""Synthetic MPLADS data generator (FR-DIM-002).

Pure generation: returns records as dicts with ground-truth labels. Seeded for
reproducibility (seed=42 default) per AC-DIM-002-04.
"""
from __future__ import annotations

import random
from datetime import date, timedelta

CATEGORIES = [
    "EDUCATION",
    "HEALTH",
    "DRINKING_WATER",
    "SANITATION",
    "ROADS",
    "COMMUNITY_ASSETS",
    "POWER",
    "SPORTS",
    "OTHER",
]

CATEGORY_TEMPLATES = {
    "EDUCATION": ["Construction of {n} classrooms at {p} school", "Supply of furniture to {p} school"],
    "HEALTH": ["Upgradation of primary health centre at {p}", "Purchase of ambulance for {p} PHC"],
    "DRINKING_WATER": ["Installation of borewell at {p}", "Construction of overhead water tank at {p}"],
    "SANITATION": ["Construction of public toilet block at {p}", "Drainage line work at {p}"],
    "ROADS": ["Concrete road from {p} to main road", "Repair of approach road at {p}"],
    "COMMUNITY_ASSETS": ["Construction of community hall at {p}", "Development of public park at {p}"],
    "POWER": ["Installation of solar street lights at {p}", "High mast lighting at {p} chowk"],
    "SPORTS": ["Development of playground at {p}", "Construction of gymnasium at {p}"],
    "OTHER": ["Construction of bus shelter at {p}", "Boundary wall for public land at {p}"],
}

STATES = {
    "Maharashtra": [("Pune", "Pune"), ("Nagpur", "Nagpur"), ("Nashik", "Nashik"), ("Thane", "Thane")],
    "Uttar Pradesh": [("Lucknow", "Lucknow"), ("Varanasi", "Varanasi"), ("Kanpur", "Kanpur")],
    "Karnataka": [("Bangalore North", "Bengaluru"), ("Mysore", "Mysuru"), ("Belgaum", "Belagavi")],
    "Tamil Nadu": [("Chennai South", "Chennai"), ("Coimbatore", "Coimbatore"), ("Madurai", "Madurai")],
    "West Bengal": [("Kolkata Dakshin", "Kolkata"), ("Darjeeling", "Darjeeling")],
    "Gujarat": [("Ahmedabad East", "Ahmedabad"), ("Surat", "Surat"), ("Rajkot", "Rajkot")],
    "Rajasthan": [("Jaipur", "Jaipur"), ("Jodhpur", "Jodhpur")],
    "Bihar": [("Patna Sahib", "Patna"), ("Gaya", "Gaya")],
    "Kerala": [("Thiruvananthapuram", "Thiruvananthapuram"), ("Ernakulam", "Ernakulam")],
    "Madhya Pradesh": [("Bhopal", "Bhopal"), ("Indore", "Indore")],
}

PLACES = ["Rampur", "Shivnagar", "Gokulpur", "Anandwadi", "Bhimnagar", "Chandrapur",
          "Devgaon", "Ekta Nagar", "Fatehpur", "Ganeshwadi", "Haripur", "Indranagar"]
AGENCIES = ["PWD", "Zilla Parishad", "Municipal Corporation", "Rural Development Agency", "Jal Board"]
STATUSES = ["SANCTIONED", "IN_PROGRESS", "COMPLETED", "COMPLETED", "ON_HOLD"]

FINANCIAL_YEARS = ["2019-20", "2020-21", "2021-22", "2022-23", "2023-24"]


def _fy_start(financial_year: str) -> date:
    return date(int(financial_year.split("-")[0]), 4, 1)


def constituency_pool() -> list[dict]:
    """Flatten the state map into a deterministic constituency list."""
    pool = []
    for state, seats in STATES.items():
        for name, district in seats:
            pool.append({"name": name, "state": state, "district": district})
    return pool


def generate_dataset(
    num_constituencies: int = 12,
    works_per_constituency: int = 60,
    financial_years: list[str] | None = None,
    anomaly_rate: float = 0.08,
    seed: int = 42,
) -> dict:
    """Return {'constituencies', 'works', 'fund_releases', 'labels'}."""
    rng = random.Random(seed)
    years = financial_years or FINANCIAL_YEARS
    pool = constituency_pool()
    chosen = [dict(c) for c in pool[: max(1, min(num_constituencies, len(pool)))]]
    for index, constituency in enumerate(chosen):
        constituency["mp_name"] = f"MP {constituency['name']}"
        constituency["mp_type"] = "LOK_SABHA" if index % 7 else "RAJYA_SABHA"

    works, releases, labels = [], [], []
    counter = 0

    # Roughly a fifth of constituencies are "hotspots" carrying a multiple of
    # the baseline anomaly rate, so the heatmap shows genuine variation rather
    # than uniform noise. The clean rate is lowered to compensate, keeping the
    # dataset-wide rate at `anomaly_rate` (AC-DIM-002-02).
    hotspots = {c["name"] for c in chosen if rng.random() < 0.2}
    hotspot_share = len(hotspots) / len(chosen)
    hotspot_multiplier = 3.0
    clean_rate = (
        anomaly_rate * (1 - hotspot_share * hotspot_multiplier) / (1 - hotspot_share)
        if hotspot_share < 1 and hotspot_share * hotspot_multiplier < 1
        else anomaly_rate
    )

    for constituency in chosen:
        local_anomaly_rate = max(
            0.0,
            anomaly_rate * hotspot_multiplier if constituency["name"] in hotspots else clean_rate,
        )
        for year in years:
            year_start = _fy_start(year)
            released = round(rng.uniform(1.5e7, 2.5e7), 2)
            releases.append(
                {
                    "release_id": f"R{len(releases) + 1:06d}",
                    "constituency_name": constituency["name"],
                    "financial_year": year,
                    "installment_number": 1,
                    "amount_released": released,
                    "release_date": year_start + timedelta(days=rng.randint(0, 60)),
                }
            )

            per_year = max(1, works_per_constituency // len(years))
            for _ in range(per_year):
                counter += 1
                category = rng.choice(CATEGORIES)
                place = rng.choice(PLACES)
                description = rng.choice(CATEGORY_TEMPLATES[category]).format(
                    p=place, n=rng.randint(2, 6)
                )
                sanctioned = round(rng.choice([1, 1, 1, 5]) * rng.randrange(50_000, 1_000_000, 50_000), 2)
                sanction_date = year_start + timedelta(days=rng.randint(0, 360))
                expected = sanction_date + timedelta(days=rng.randint(120, 540))
                # Older financial years are mostly wrapped up; only recent years
                # still carry a realistic share of open works.
                years_elapsed = date.today().year - year_start.year
                status = (
                    "COMPLETED" if rng.random() < min(0.92, 0.45 + 0.15 * years_elapsed)
                    else rng.choice(STATUSES)
                )
                is_anomalous = rng.random() < local_anomaly_rate

                work = {
                    "work_id": f"W{counter:07d}",
                    "constituency_name": constituency["name"],
                    "state": constituency["state"],
                    "district_name": constituency["district"],
                    "work_description": description,
                    "work_category": category,
                    "sanctioned_amount": sanctioned,
                    "actual_expenditure": round(sanctioned * rng.uniform(0.6, 1.05), 2),
                    "sanction_date": sanction_date,
                    "expected_completion_date": expected,
                    "completion_date": expected - timedelta(days=rng.randint(0, 60))
                    if status == "COMPLETED"
                    else None,
                    "work_status": status,
                    "implementing_agency": rng.choice(AGENCIES),
                    "financial_year": year,
                    "latitude": round(rng.uniform(8.0, 34.0), 6),
                    "longitude": round(rng.uniform(70.0, 95.0), 6),
                }

                if is_anomalous:
                    # Genuine irregularities tend to compound, so hotspot works
                    # can receive more than one injected defect.
                    kinds = ["COST_OVERRUN", "DUPLICATE_WORK", "DELAYED_PROJECT"]
                    injected_kinds = (
                        rng.sample(kinds, k=rng.randint(2, 3))
                        if constituency["name"] in hotspots and rng.random() < 0.6
                        else [rng.choice(kinds)]
                    )

                    for injected in injected_kinds:
                        if injected == "COST_OVERRUN":
                            work["actual_expenditure"] = round(sanctioned * rng.uniform(1.2, 3.0), 2)
                        elif injected == "DELAYED_PROJECT":
                            work["work_status"] = "IN_PROGRESS"
                            work["completion_date"] = None
                            work["expected_completion_date"] = date.today() - timedelta(
                                days=rng.randint(200, 730)
                            )
                        else:  # DUPLICATE_WORK — emit a near-identical twin
                            counter += 1
                            twin = dict(work)
                            twin["work_id"] = f"W{counter:07d}"
                            twin["work_description"] = description.replace(" at ", " in ")
                            twin["sanctioned_amount"] = round(sanctioned * rng.uniform(0.95, 1.05), 2)
                            twin["sanction_date"] = sanction_date + timedelta(days=rng.randint(5, 90))
                            works.append(twin)
                            labels.append(
                                {"work_id": twin["work_id"], "anomaly_type": "DUPLICATE_WORK",
                                 "anomaly_injected": True, "anomaly_description": "Near-identical twin work"}
                            )
                        labels.append(
                            {"work_id": work["work_id"], "anomaly_type": injected,
                             "anomaly_injected": True, "anomaly_description": f"Injected {injected}"}
                        )

                works.append(work)

    return {"constituencies": chosen, "works": works, "fund_releases": releases, "labels": labels}
