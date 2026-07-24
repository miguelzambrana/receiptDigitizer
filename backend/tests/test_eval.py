from app.schemas import ReceiptData, ItemData
from eval.run_eval import score_extraction

def test_score_extraction():
    expected = {"store_contains": "Carrefour", "total": 45.53, "item_count": 5}
    got = ReceiptData(store="Centros Comerciales Carrefour S.A.", total=45.53,
                      items=[ItemData(raw_name=f"i{i}", total_price=1.0) for i in range(4)])
    s = score_extraction(expected, got)
    assert s["store_ok"] is True
    assert s["total_ok"] is True
    assert s["item_count_got"] == 4
    assert abs(s["item_recall"] - 0.8) < 1e-6
