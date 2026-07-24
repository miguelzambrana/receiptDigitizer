from fastapi import FastAPI
from app.api.receipts import router as receipts_router

app = FastAPI(title="Receipt Digitizer")
app.include_router(receipts_router)

@app.get("/health")
def health():
    return {"status": "ok"}
