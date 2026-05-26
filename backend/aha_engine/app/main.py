from __future__ import annotations

import os

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.engine.analyzer import analyze_message
from app.schemas import AnalyzeRequest, CanonicalAhaAnalysis

DEFAULT_ALLOWED_ORIGINS = [
    "http://localhost:3000",
    "http://127.0.0.1:5500",
    "http://localhost:5500",
]


def parse_allowed_origins(value: str | None) -> list[str]:
    if value is None:
        return DEFAULT_ALLOWED_ORIGINS.copy()

    origins = [origin.strip() for origin in value.split(",") if origin.strip()]
    return origins or DEFAULT_ALLOWED_ORIGINS.copy()


app = FastAPI(title="AHA Engine", version="0.1.0")

allowed_origins = parse_allowed_origins(os.getenv("AHA_ENGINE_ALLOWED_ORIGINS"))
app.add_middleware(
    CORSMiddleware,
    allow_origins=allowed_origins,
    allow_credentials=True,
    allow_methods=["GET", "POST", "OPTIONS"],
    allow_headers=["*"],
)


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok", "service": "aha-engine"}


@app.post("/api/aha/analyze", response_model=CanonicalAhaAnalysis)
def analyze(request: AnalyzeRequest) -> CanonicalAhaAnalysis:
    return analyze_message(request)
