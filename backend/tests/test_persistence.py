from sqlalchemy import select, func
from app.models import User, Receipt, PriceObservation, ReceiptItem
from app.schemas import ReceiptData, ItemData
from app.services.persistence import confirm_receipt

def test_confirm_writes_items_and_price_observations(db_session):
    u = User(email="p@q.com"); db_session.add(u); db_session.flush()
    r = Receipt(user_id=u.id, image_path="x.jpg", status="ready"); db_session.add(r); db_session.flush()
    corrected = ReceiptData(
        store="Carrefour", country="ES", currency="EUR", date_text="21/07/26", total=13.19,
        items=[ItemData(raw_name="CARNE VIEIRA 320 G", total_price=13.49),
               ItemData(raw_name="PROMO", total_price=-0.30, is_discount=True)],
    )
    confirm_receipt(db_session, r.id, corrected)
    db_session.flush()
    assert r.status == "confirmed"
    assert r.store_id is not None
    n_items = db_session.execute(select(func.count()).select_from(ReceiptItem).where(ReceiptItem.receipt_id == r.id)).scalar()
    assert n_items == 2
    # only the non-discount item becomes a price observation
    obs = db_session.execute(select(PriceObservation).where(PriceObservation.user_id == u.id)).scalars().all()
    assert len(obs) == 1
    assert float(obs[0].price) == 13.49
