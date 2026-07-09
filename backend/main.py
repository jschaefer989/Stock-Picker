"""
Stock Picker – FastAPI backend
Entry point: uvicorn main:app --reload
"""
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from routers import portfolio, market
from services.db_service import init_db

app = FastAPI(title="Stock Picker API", version="1.0.0")

# Allow the Next.js dev server to call the API
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"],
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(portfolio.router, prefix="/api/portfolio", tags=["portfolio"])
app.include_router(market.router, prefix="/api/market", tags=["market"])

init_db()


@app.get("/api/health")
def health() -> dict[str, str]:
    return {"status": "ok"}
