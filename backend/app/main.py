"""MPLADS Sentinel API entrypoint (SIH-26102)."""
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from .config import get_settings
from .routers import admin, analytics, auth, data, reports
from .seed import bootstrap

API_PREFIX = "/api/v1"

app = FastAPI(
    title="MPLADS Sentinel API",
    version="1.0.0-MVP",
    description="AI-powered anomaly detection for the MPLADS scheme (SIH-26102).",
    docs_url=f"{API_PREFIX}/docs",
    openapi_url=f"{API_PREFIX}/openapi.json",
)

settings = get_settings()
app.add_middleware(
    CORSMiddleware,
    allow_origins=[o.strip() for o in settings.cors_origins.split(",")],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)

for router in (auth.router, data.router, analytics.router, admin.router, reports.router):
    app.include_router(router, prefix=API_PREFIX)


@app.get(f"{API_PREFIX}/health", tags=["system"])
def health() -> dict:
    return {"status": "ok", "environment": settings.environment}


@app.on_event("startup")
def on_startup() -> None:
    bootstrap(with_demo_data=True)
