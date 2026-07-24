import io
from PIL import Image
from fastapi.testclient import TestClient
from app.main import app
from app.db import Base, engine
from app import models  # noqa: F401  (register models; avoids rebinding `app` above, cf. conftest.py)

def _png():
    buf = io.BytesIO(); Image.new("RGB", (40, 40), "white").save(buf, "PNG"); return buf.getvalue()

def test_products_and_prices(monkeypatch, tmp_path):
    from app.config import settings
    monkeypatch.setattr(settings, "storage_dir", str(tmp_path))
    monkeypatch.setattr(settings, "reader_engine", "fake")
    Base.metadata.create_all(bind=engine)
    c = TestClient(app)
    rid = c.post("/receipts", files={"file": ("t.png", _png(), "image/png")}).json()["id"]
    c.put(f"/receipts/{rid}", json={"store": "Carrefour", "currency": "EUR", "date_text": "21/07/26",
          "total": 13.49, "items": [{"raw_name": "CARNE VIEIRA 320 G", "total_price": 13.49}]})
    prods = c.get("/products").json()
    assert len(prods) == 1 and prods[0]["display_name"].startswith("CARNE")
    pid = prods[0]["id"]
    prices = c.get(f"/products/{pid}/prices").json()
    assert prices[0]["price"] == 13.49
    Base.metadata.drop_all(bind=engine)
