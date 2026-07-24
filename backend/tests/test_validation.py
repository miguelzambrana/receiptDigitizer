from datetime import datetime
from app.schemas import ReceiptData, ItemData
from app.validation import reconcile, parse_date

def test_reconcile_matches_within_tolerance():
    d = ReceiptData(total=10.00, items=[
        ItemData(raw_name="a", total_price=7.00),
        ItemData(raw_name="b", total_price=3.00),
    ])
    r = reconcile(d)
    assert r["items_sum"] == 10.00
    assert r["matches"] is True

def test_reconcile_flags_mismatch():
    d = ReceiptData(total=45.53, items=[ItemData(raw_name="a", total_price=13.49)])
    r = reconcile(d)
    assert r["matches"] is False
    assert round(r["delta"], 2) == round(13.49 - 45.53, 2)

def test_parse_date_variants():
    assert parse_date("21/07/26") == datetime(2026, 7, 21)
    assert parse_date("2026-07-21") == datetime(2026, 7, 21)
    assert parse_date("garbage") is None
