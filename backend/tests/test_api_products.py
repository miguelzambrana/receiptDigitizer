import io
from datetime import datetime, timezone
from PIL import Image
from sqlalchemy import select
from fastapi.testclient import TestClient
from app.main import app
from app.db import Base, engine, SessionLocal
from app import models  # noqa: F401  (register models; avoids rebinding `app` above, cf. conftest.py)

def _png():
    buf = io.BytesIO(); Image.new("RGB", (40, 40), "white").save(buf, "PNG"); return buf.getvalue()

def _auth(c, email="dev@example.com", password="pw12345"):
    c.post("/auth/register", json={"email": email, "password": password})
    tok = c.post("/auth/login", json={"email": email, "password": password}).json()["access_token"]
    return {"Authorization": f"Bearer {tok}"}

def test_products_and_prices(monkeypatch, tmp_path):
    from app.config import settings
    monkeypatch.setattr(settings, "storage_dir", str(tmp_path))
    monkeypatch.setattr(settings, "reader_engine", "fake")
    Base.metadata.create_all(bind=engine)
    c = TestClient(app)
    headers = _auth(c)
    rid = c.post("/receipts", files={"file": ("t.png", _png(), "image/png")}, headers=headers).json()["id"]
    c.put(f"/receipts/{rid}", json={"store": "Carrefour", "currency": "EUR", "date_text": "21/07/26",
          "total": 13.49, "items": [{"raw_name": "CARNE VIEIRA 320 G", "total_price": 13.49}]}, headers=headers)
    prods = c.get("/products", headers=headers).json()
    assert len(prods) == 1 and prods[0]["display_name"].startswith("CARNE")
    pid = prods[0]["id"]
    prices = c.get(f"/products/{pid}/prices", headers=headers).json()
    assert prices[0]["price"] == 13.49
    Base.metadata.drop_all(bind=engine)

def test_products_currency_and_last_price_from_same_latest_observation(monkeypatch, tmp_path):
    from app.config import settings
    monkeypatch.setattr(settings, "storage_dir", str(tmp_path))
    monkeypatch.setattr(settings, "reader_engine", "fake")
    Base.metadata.create_all(bind=engine)
    c = TestClient(app)
    headers = _auth(c, email="prices@example.com")

    session = SessionLocal()
    try:
        user = session.execute(select(models.User).where(models.User.email == "prices@example.com")).scalar_one()
        product = models.Product(normalized_name="MULTI CURRENCY PRODUCT", display_name="Multi Currency Product")
        session.add(product); session.commit(); session.refresh(product)

        receipt = models.Receipt(user_id=user.id, image_path="x.png", status="done")
        session.add(receipt); session.commit(); session.refresh(receipt)

        older_item = models.ReceiptItem(receipt_id=receipt.id, line_no=1, raw_name="OLD ITEM",
                                         product_id=product.id, total_price=5.00)
        newer_item = models.ReceiptItem(receipt_id=receipt.id, line_no=2, raw_name="NEW ITEM",
                                         product_id=product.id, total_price=9.99)
        session.add_all([older_item, newer_item]); session.commit()
        session.refresh(older_item); session.refresh(newer_item)

        older_obs = models.PriceObservation(product_id=product.id, user_id=user.id,
                                             receipt_item_id=older_item.id, price=5.00, currency="USD",
                                             observed_at=datetime(2026, 1, 1, tzinfo=timezone.utc))
        newer_obs = models.PriceObservation(product_id=product.id, user_id=user.id,
                                             receipt_item_id=newer_item.id, price=9.99, currency="EUR",
                                             observed_at=datetime(2026, 7, 1, tzinfo=timezone.utc))
        session.add_all([older_obs, newer_obs]); session.commit()
        product_id = product.id
    finally:
        session.close()

    prods = c.get("/products", headers=headers).json()
    match = [p for p in prods if p["id"] == product_id]
    assert len(match) == 1
    p = match[0]
    assert p["last_price"] == 9.99
    assert p["currency"] == "EUR"
    assert p["observations"] == 2

    prices = c.get(f"/products/{product_id}/prices", headers=headers).json()
    assert len(prices) == 2
    assert prices[0]["price"] == 9.99
    assert prices[1]["price"] == 5.00
    Base.metadata.drop_all(bind=engine)
