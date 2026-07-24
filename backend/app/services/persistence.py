from sqlalchemy import select, delete
from sqlalchemy.orm import Session
from app.models import Receipt, ReceiptItem, Store, PriceObservation
from app.schemas import ReceiptData
from app.services.products import find_or_create_product
from app.validation import parse_date

def find_or_create_store(db: Session, *, chain_name, address, city, country, tax_id) -> Store:
    stmt = None
    if tax_id:
        stmt = select(Store).where(Store.tax_id == tax_id)
    elif chain_name:
        stmt = select(Store).where(Store.chain_name == chain_name, Store.city == city)
    existing = db.execute(stmt).scalar_one_or_none() if stmt is not None else None
    if existing:
        return existing
    s = Store(chain_name=chain_name or "Unknown", address=address, city=city,
              country=country, tax_id=tax_id)
    db.add(s); db.flush()
    return s

def confirm_receipt(db: Session, receipt_id: int, corrected: ReceiptData) -> Receipt:
    receipt = db.get(Receipt, receipt_id)
    if receipt is None:
        raise ValueError("receipt not found")
    # Query old items directly (not via receipt.items) so this sees the current
    # DB state even if the relationship collection was already loaded/cached
    # earlier in this session (e.g. a prior confirm_receipt call).
    old_items = db.execute(select(ReceiptItem).where(ReceiptItem.receipt_id == receipt.id)).scalars().all()
    old_ids = [i.id for i in old_items]
    if old_ids:
        db.execute(delete(PriceObservation).where(PriceObservation.receipt_item_id.in_(old_ids)))
    for old in old_items:
        db.delete(old)
    db.flush()

    store = find_or_create_store(db, chain_name=corrected.store, address=corrected.address,
                                 city=corrected.city, country=corrected.country, tax_id=corrected.tax_id)
    receipt.store_id = store.id
    receipt.currency = corrected.currency
    receipt.subtotal = corrected.subtotal
    receipt.tax_amount = corrected.tax_amount
    receipt.total = corrected.total
    receipt.purchased_at = parse_date(corrected.date_text)

    for i, item in enumerate(corrected.items):
        product = find_or_create_product(db, item.raw_name) if not item.is_discount else None
        ri = ReceiptItem(receipt_id=receipt.id, line_no=i, raw_name=item.raw_name,
                         product_id=product.id if product else None, quantity=item.quantity,
                         unit_price=item.unit_price, total_price=item.total_price,
                         is_discount=item.is_discount, tax_class=item.tax_class)
        db.add(ri); db.flush()
        if product is not None:
            db.add(PriceObservation(product_id=product.id, store_id=store.id, user_id=receipt.user_id,
                                    receipt_item_id=ri.id, price=item.total_price,
                                    currency=corrected.currency, observed_at=receipt.purchased_at))
    receipt.status = "confirmed"
    db.flush()
    return receipt
