import io
from PIL import Image
from fastapi.testclient import TestClient
from app.main import app
from app.db import Base, engine
from app import models  # noqa: F401  (avoids rebinding `app` above, cf. conftest.py)

def _client():
    Base.metadata.create_all(bind=engine)
    return TestClient(app)

def _png_bytes():
    buf = io.BytesIO(); Image.new("RGB", (50, 50), "white").save(buf, format="PNG"); return buf.getvalue()

def test_upload_confirm_and_list(monkeypatch, tmp_path):
    from app.config import settings
    monkeypatch.setattr(settings, "storage_dir", str(tmp_path))
    monkeypatch.setattr(settings, "reader_engine", "fake")
    c = _client()
    r = c.post("/receipts", files={"file": ("t.png", _png_bytes(), "image/png")})
    assert r.status_code == 202
    rid = r.json()["id"]
    got = c.get(f"/receipts/{rid}")
    assert got.status_code == 200
    assert got.json()["status"] in ("ready", "processing")
    body = {"store": "Carrefour", "currency": "EUR", "date_text": "21/07/26", "total": 13.49,
            "items": [{"raw_name": "CARNE VIEIRA 320 G", "total_price": 13.49}]}
    put = c.put(f"/receipts/{rid}", json=body)
    assert put.status_code == 200 and put.json()["status"] == "confirmed"
    lst = c.get("/receipts")
    assert any(x["id"] == rid for x in lst.json())
    Base.metadata.drop_all(bind=engine)

def test_upload_unexpected_reader_error_marks_receipt_failed(monkeypatch, tmp_path):
    # Hardening: an UNEXPECTED (non-ReaderError) exception raised during background
    # extraction (e.g. a corrupt image, or any bug in the reader) must not leave the
    # receipt stuck in "processing" forever. A client polling GET /receipts/{id} must
    # eventually see a terminal state.
    from app.config import settings
    import app.services.extraction as extraction_module

    monkeypatch.setattr(settings, "storage_dir", str(tmp_path))
    monkeypatch.setattr(settings, "reader_engine", "fake")

    class BoomReader:
        name = "boom"
        def extract(self, image_bytes):
            raise ValueError("corrupt image")

    monkeypatch.setattr(extraction_module, "get_reader", lambda engine=None: BoomReader())

    c = _client()
    r = c.post("/receipts", files={"file": ("t.png", _png_bytes(), "image/png")})
    assert r.status_code == 202
    rid = r.json()["id"]

    got = c.get(f"/receipts/{rid}")
    assert got.status_code == 200
    assert got.json()["status"] == "failed"
    assert "error" in got.json()["raw_extraction"]
    Base.metadata.drop_all(bind=engine)
