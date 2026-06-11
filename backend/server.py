"""RetailFlow AI - Main FastAPI app."""
from fastapi import FastAPI
from starlette.middleware.cors import CORSMiddleware
from dotenv import load_dotenv
from pathlib import Path
import os
import logging

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

app = FastAPI(title="RetailFlow AI", version="1.0.0")

from routes_core import router as core_router
from routes_business import router as biz_router
from routes_dashboard import router as dash_router

app.include_router(core_router)
app.include_router(biz_router)
app.include_router(dash_router)


@app.get("/api/health")
async def health():
    return {"status": "ok", "service": "RetailFlow AI"}


app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=os.environ.get('CORS_ORIGINS', '*').split(','),
    allow_methods=["*"],
    allow_headers=["*"],
)

logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)
