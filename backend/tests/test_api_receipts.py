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

def _auth(c, email="dev@example.com", password="pw12345"):
    c.post("/auth/register", json={"email": email, "password": password})
    tok = c.post("/auth/login", json={"email": email, "password": password}).json()["access_token"]
    return {"Authorization": f"Bearer {tok}"}

def test_upload_confirm_and_list(monkeypatch, tmp_path):
    from app.config import settings
    monkeypatch.setattr(settings, "storage_dir", str(tmp_path))
    monkeypatch.setattr(settings, "reader_engine", "fake")
    c = _client()
    headers = _auth(c)
    r = c.post("/receipts", files={"file": ("t.png", _png_bytes(), "image/png")}, headers=headers)
    assert r.status_code == 202
    rid = r.json()["id"]
    got = c.get(f"/receipts/{rid}", headers=headers)
    assert got.status_code == 200
    assert got.json()["status"] in ("ready", "processing")
    body = {"store": "Carrefour", "currency": "EUR", "date_text": "21/07/26", "total": 13.49,
            "items": [{"raw_name": "CARNE VIEIRA 320 G", "total_price": 13.49}]}
    put = c.put(f"/receipts/{rid}", json=body, headers=headers)
    assert put.status_code == 200 and put.json()["status"] == "confirmed"
    lst = c.get("/receipts", headers=headers)
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
    headers = _auth(c)
    r = c.post("/receipts", files={"file": ("t.png", _png_bytes(), "image/png")}, headers=headers)
    assert r.status_code == 202
    rid = r.json()["id"]

    got = c.get(f"/receipts/{rid}", headers=headers)
    assert got.status_code == 200
    assert got.json()["status"] == "failed"
    assert "error" in got.json()["raw_extraction"]
    Base.metadata.drop_all(bind=engine)

def test_get_and_confirm_reject_non_owner(monkeypatch, tmp_path):
    # The "current user" is now whoever is authenticated via the bearer token (user A).
    # Both GET /receipts/{id} and PUT /receipts/{id} guard with
    # `if r is None or r.user_id != user.id: raise HTTPException(404)`. This creates a
    # receipt owned by a DIFFERENT user (inserted directly via SessionLocal, bypassing
    # the API) and proves A's request 404s rather than leaking another user's receipt.
    from app.config import settings
    from app.db import SessionLocal
    from app.models import User, Receipt

    monkeypatch.setattr(settings, "storage_dir", str(tmp_path))
    monkeypatch.setattr(settings, "reader_engine", "fake")
    c = _client()
    headers = _auth(c, email="a@example.com")

    db = SessionLocal()
    try:
        other = User(email="other@local")
        db.add(other); db.commit(); db.refresh(other)
        receipt = Receipt(user_id=other.id, image_path="x.jpg", status="ready")
        db.add(receipt); db.commit(); db.refresh(receipt)
        other_receipt_id = receipt.id
    finally:
        db.close()

    got = c.get(f"/receipts/{other_receipt_id}", headers=headers)
    assert got.status_code == 404

    body = {"store": "Carrefour", "currency": "EUR", "date_text": "21/07/26", "total": 13.49,
            "items": [{"raw_name": "CARNE VIEIRA 320 G", "total_price": 13.49}]}
    put = c.put(f"/receipts/{other_receipt_id}", json=body, headers=headers)
    assert put.status_code == 404

    Base.metadata.drop_all(bind=engine)
