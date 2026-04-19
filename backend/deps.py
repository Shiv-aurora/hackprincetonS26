# FastAPI dependency helpers that pull shared state from app.state.
from __future__ import annotations

from typing import Any

from fastapi import Request

from ngsp.pipeline import Pipeline, SessionBudget


# Return the shared Pipeline instance stored on the FastAPI application state.
def get_pipeline(request: Request) -> Pipeline:
    return request.app.state.pipeline


# Return the shared SessionBudget instance stored on the FastAPI application state.
def get_budget(request: Request) -> SessionBudget:
    return request.app.state.budget


# Return the local model (may be None when NGSP_SKIP_LOCAL_MODEL=1).
def get_local_model(request: Request) -> Any | None:
    return request.app.state.local_model
