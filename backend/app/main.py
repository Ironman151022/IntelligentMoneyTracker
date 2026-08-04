from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.evaluation import router as evaluation_router
from app.api.graph import router as graph_router
from app.api.transaction import router as transaction_router

app = FastAPI(title="Intelligent Money Tracker")
app.add_middleware(
    CORSMiddleware,
    # Allow all origins — this backend runs locally and never exposes secrets.
    # Tighten before any public deployment.
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)
app.include_router(transaction_router)
app.include_router(evaluation_router)
app.include_router(graph_router)
