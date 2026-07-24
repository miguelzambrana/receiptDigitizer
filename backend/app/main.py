from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.api.receipts import router as receipts_router
from app.api.products import router as products_router
from app.api.auth import router as auth_router
from app.db import Base, engine
from app import models  # noqa: F401  (import models so their tables register on Base.metadata)

@asynccontextmanager
async def lifespan(app: FastAPI):
    # Belt-and-suspenders for a fresh clone: create any missing tables on startup.
    # Idempotent (no-op if tables already exist). Alembic remains the source of
    # truth for migrations; this just avoids a hard "no such table" 500 when
    # someone runs the app against a brand-new DB without migrating first.
    Base.metadata.create_all(bind=engine)
    yield

app = FastAPI(title="Receipt Digitizer", lifespan=lifespan)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
app.include_router(receipts_router)
app.include_router(products_router)
app.include_router(auth_router)

@app.get("/health")
def health():
    return {"status": "ok"}
