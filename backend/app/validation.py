from datetime import datetime
from app.schemas import ReceiptData

_FORMATS = ["%d/%m/%y", "%d/%m/%Y", "%Y-%m-%d", "%d/%b/%y"]

def parse_date(text):
    if not text:
        return None
    t = str(text).strip()
    for fmt in _FORMATS:
        try:
            return datetime.strptime(t, fmt)
        except ValueError:
            continue
    return None

def reconcile(data: ReceiptData) -> dict:
    items_sum = round(sum(i.total_price for i in data.items), 2)
    total = data.total
    delta = round(items_sum - total, 2) if total is not None else None
    matches = total is not None and abs(items_sum - total) <= 0.02
    return {"items_sum": items_sum, "expected_total": total, "delta": delta, "matches": matches}
