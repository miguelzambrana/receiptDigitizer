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
    raw = float(sum(i.total_price for i in data.items))
    items_sum = round(raw, 2)
    total = data.total
    delta = round(raw - total, 2) if total is not None else None
    matches = total is not None and abs(raw - total) <= 0.02
    return {"items_sum": items_sum, "expected_total": total, "delta": delta, "matches": matches}
