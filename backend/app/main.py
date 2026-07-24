from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.api.receipts import router as receipts_router
from app.api.products import router as products_router
from app.api.auth import router as auth_router

app = FastAPI(title="Receipt Digitizer")
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
