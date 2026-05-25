from __future__ import annotations

from fastapi import FastAPI

from app.engine.analyzer import analyze_message
from app.schemas import AnalyzeRequest, CanonicalAhaAnalysis

app = FastAPI(title="AHA Engine", version="0.1.0")


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok", "service": "aha-engine"}


@app.post("/api/aha/analyze", response_model=CanonicalAhaAnalysis)
def analyze(request: AnalyzeRequest) -> CanonicalAhaAnalysis:
    return analyze_message(request)
