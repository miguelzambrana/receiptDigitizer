from sqlalchemy import select, func
from app.models import User, Receipt, PriceObservation, ReceiptItem, Store
from app.schemas import ReceiptData, ItemData
from app.services.persistence import confirm_receipt, find_or_create_store

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

def test_confirm_is_idempotent_on_reconfirm(db_session):
    u = User(email="idem@q.com"); db_session.add(u); db_session.flush()
    r = Receipt(user_id=u.id, image_path="x.jpg", status="ready"); db_session.add(r); db_session.flush()
    corrected = ReceiptData(
        store="Carrefour", country="ES", currency="EUR", date_text="21/07/26", total=13.19,
        items=[ItemData(raw_name="CARNE VIEIRA 320 G", total_price=13.49),
               ItemData(raw_name="PROMO", total_price=-0.30, is_discount=True)],
    )
    confirm_receipt(db_session, r.id, corrected)
    db_session.flush()
    # re-confirm with the SAME corrected data
    confirm_receipt(db_session, r.id, corrected)
    db_session.flush()

    items = db_session.execute(select(ReceiptItem).where(ReceiptItem.receipt_id == r.id)).scalars().all()
    assert len(items) == 2

    obs = db_session.execute(select(PriceObservation).where(PriceObservation.user_id == u.id)).scalars().all()
    assert len(obs) == 1
    assert float(obs[0].price) == 13.49

    # the surviving observation must reference a receipt_item that still exists
    current_item_ids = {i.id for i in items}
    assert obs[0].receipt_item_id in current_item_ids

def test_find_or_create_store_is_idempotent(db_session):
    # same tax_id, different other fields -> same store
    s1 = find_or_create_store(db_session, chain_name="ChainA", address="Addr1",
                               city="City1", country="ES", tax_id="A123")
    s2 = find_or_create_store(db_session, chain_name="ChainB", address="Addr2",
                               city="City2", country="FR", tax_id="A123")
    assert s1.id == s2.id

    # no tax_id, same chain_name+city -> same store
    s3 = find_or_create_store(db_session, chain_name="Mercadona", address=None,
                               city="Madrid", country="ES", tax_id=None)
    s4 = find_or_create_store(db_session, chain_name="Mercadona", address=None,
                               city="Madrid", country="ES", tax_id=None)
    assert s3.id == s4.id

    # different chain_name+city -> new store
    s5 = find_or_create_store(db_session, chain_name="Carrefour", address=None,
                               city="Barcelona", country="ES", tax_id=None)
    assert s5.id != s3.id

    n_stores = db_session.execute(select(func.count()).select_from(Store)).scalar()
    assert n_stores == 3
