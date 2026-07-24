from sqlalchemy.orm import Session
from app.models import Receipt
from app.preprocess import preprocess
from app.storage import read_image
from app.readers.factory import get_reader
from app.readers.base import ReaderError
from app.validation import reconcile, parse_date

def run_extraction(db: Session, receipt_id: int, reader=None) -> None:
    reader = reader or get_reader()
    receipt = db.get(Receipt, receipt_id)
    if receipt is None:
        return
    try:
        image = preprocess(read_image(receipt.image_path))
        data = reader.extract(image)
    except ReaderError as e:
        receipt.status = "failed"
        receipt.raw_extraction = {"error": str(e)}
        db.commit()
        return
    rec = reconcile(data)
    purchased = parse_date(data.date_text)
    dump = data.model_dump()
    dump["reconciliation"] = rec
    dump["purchased_at"] = purchased.isoformat() if purchased else None
    receipt.raw_extraction = dump
    receipt.source_engine = reader.name
    receipt.currency = data.currency
    receipt.subtotal = data.subtotal
    receipt.tax_amount = data.tax_amount
    receipt.total = data.total
    receipt.purchased_at = purchased
    receipt.status = "ready"
    db.commit()
