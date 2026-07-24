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

def test_parse_date_dmy_full_year():
    assert parse_date("21/07/2026") == datetime(2026, 7, 21)

def test_parse_date_dby_abbreviated_month():
    assert parse_date("19/Jul/26") == datetime(2026, 7, 19)

def test_parse_date_empty_string_is_none():
    assert parse_date("") is None

def test_parse_date_none_is_none():
    assert parse_date(None) is None

def test_reconcile_tolerance_uses_raw_sum_not_rounded():
    # raw items sum is 10.021 (10.011 + 0.01), which rounds to 10.02.
    # Rounding first would wrongly report matches=True against total=10.00
    # (abs(10.02 - 10.00) == 0.02 <= tolerance). The raw sum exceeds the
    # 0.02 tolerance (abs(10.021 - 10.00) == 0.021), so matches must be False.
    d = ReceiptData(total=10.00, items=[
        ItemData(raw_name="a", total_price=10.011),
        ItemData(raw_name="b", total_price=0.01),
    ])
    r = reconcile(d)
    assert r["items_sum"] == 10.02
    assert r["matches"] is False

def test_reconcile_empty_items_sum_is_float_zero():
    d = ReceiptData(total=None, items=[])
    r = reconcile(d)
    assert r["items_sum"] == 0.0
    assert isinstance(r["items_sum"], float)
    assert r["matches"] is False
