from fastapi import FastAPI

app = FastAPI(title="Receipt Digitizer")

@app.get("/health")
def health():
    return {"status": "ok"}
