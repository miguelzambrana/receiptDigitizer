from app.config import settings
from app.models import User, Receipt
from app.readers.fake import FakeReader
from app.schemas import ReceiptData, ItemData
from app.services.extraction import run_extraction
from app.storage import save_image

def _seed(db):
    u = User(email="x@y.com"); db.add(u); db.flush()
    path = save_image(open("tests/fixtures/receipt_carrefour.jpg", "rb").read())
    r = Receipt(user_id=u.id, image_path=path, status="processing")
    db.add(r); db.flush()
    return r

def test_run_extraction_populates_draft(db_session, monkeypatch, tmp_path):
    monkeypatch.setattr(settings, "storage_dir", str(tmp_path))
    r = _seed(db_session)
    fake = FakeReader(ReceiptData(store="Carrefour", total=13.49, currency="EUR",
                                  items=[ItemData(raw_name="CARNE VIEIRA 320 G", total_price=13.49)]))
    run_extraction(db_session, r.id, reader=fake)
    db_session.refresh(r)
    assert r.status == "ready"
    assert r.source_engine == "fake"
    assert float(r.total) == 13.49
    assert r.raw_extraction["reconciliation"]["matches"] is True

def test_run_extraction_handles_reader_failure(db_session, monkeypatch, tmp_path):
    monkeypatch.setattr(settings, "storage_dir", str(tmp_path))
    r = _seed(db_session)
    class Boom:
        name = "boom"
        def extract(self, b):
            from app.readers.base import ReaderError
            raise ReaderError("nope")
    run_extraction(db_session, r.id, reader=Boom())
    db_session.refresh(r)
    assert r.status == "failed"
    assert "error" in r.raw_extraction
