"""MESA predictor: estimates when a reading crosses its limit.

Phase 4 baseline is a least-squares linear trend. XGBoost is an optional upgrade
(install with `uv sync --extra ml`) only if the baseline works end to end.
"""

from fastapi import FastAPI
from pydantic import BaseModel, Field

app = FastAPI(title="MESA predictor", version="0.1.0")


class Point(BaseModel):
    ts: float = Field(description="Unix time in seconds")
    value: float


class PredictRequest(BaseModel):
    asset_id: str
    metric: str
    limit: float
    points: list[Point] = Field(min_length=2)


class PredictResponse(BaseModel):
    asset_id: str
    metric: str
    slope_per_min: float
    breach_at: float | None = Field(description="Unix seconds, or null if not trending toward the limit")
    minutes_to_breach: float | None
    method: str = "linear"


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


@app.post("/predict", response_model=PredictResponse)
def predict(req: PredictRequest) -> PredictResponse:
    xs = [p.ts for p in req.points]
    ys = [p.value for p in req.points]
    n = len(xs)
    mx, my = sum(xs) / n, sum(ys) / n
    var = sum((x - mx) ** 2 for x in xs)
    slope = 0.0 if var == 0 else sum((x - mx) * (y - my) for x, y in zip(xs, ys)) / var
    last_ts, last_val = xs[-1], ys[-1]

    breach_at = None
    if last_val >= req.limit:
        breach_at = last_ts
    elif slope > 0:
        breach_at = last_ts + (req.limit - last_val) / slope

    return PredictResponse(
        asset_id=req.asset_id,
        metric=req.metric,
        slope_per_min=slope * 60,
        breach_at=breach_at,
        minutes_to_breach=None if breach_at is None else max(0.0, (breach_at - last_ts) / 60),
    )
