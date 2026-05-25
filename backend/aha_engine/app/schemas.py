from __future__ import annotations

from typing import Any

from pydantic import BaseModel, Field


class AnalyzeRequest(BaseModel):
    message: str
    assistantReply: str | None = None
    historyGoContext: dict[str, Any] = Field(default_factory=dict)


class HistoryGoLink(BaseModel):
    type: str
    id: str
    title: str
    reason: str


class Confidence(BaseModel):
    contentType: float = Field(ge=0, le=1)
    domain: float = Field(ge=0, le=1)
    theme: float = Field(ge=0, le=1)
    mainTension: float = Field(ge=0, le=1)
    historyGoLinks: float = Field(ge=0, le=1)


class CanonicalAhaAnalysis(BaseModel):
    contentType: str
    domain: str
    theme: str
    mainTension: str
    keyInsight: str
    fieldConnections: list[str]
    historyGoLinks: list[HistoryGoLink]
    suggestedActions: list[str]
    confidence: Confidence
    warnings: list[str]
