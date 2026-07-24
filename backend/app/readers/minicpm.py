import base64
import json
import httpx
from app.config import settings
from app.numbers import normalize_number
from app.schemas import ReceiptData, ItemData
from app.readers.base import ReaderError

PROMPT = (
    "Read this Spanish supermarket receipt (ticket) and return ONLY valid JSON: "
    '{"store":str,"address":str,"city":str,"country":str,"date":str,"currency":str,'
    '"subtotal":number,"tax_amount":number,"total":number,'
    '"items":[{"name":str,"quantity":number,"unit_price":number,"total_price":number}]}. '
    "List EVERY product line. PROMO/Descuento lines are discounts with negative total_price. "
    "Do not invent data; use null when a value is absent."
)

class MiniCPMReader:
    name = "minicpm"
    def __init__(self, model: str | None = None, ollama_url: str | None = None):
        self.model = model or settings.reader_model
        self.ollama_url = ollama_url or settings.ollama_url

    def extract(self, image_bytes: bytes) -> ReceiptData:
        b64 = base64.b64encode(image_bytes).decode()
        payload = {"model": self.model, "prompt": PROMPT, "images": [b64],
                   "stream": False, "format": "json",
                   "options": {"temperature": 0, "num_predict": 2500, "num_ctx": 8192}}
        try:
            with httpx.Client(timeout=240) as c:
                r = c.post(f"{self.ollama_url}/api/generate", json=payload)
                r.raise_for_status()
                raw = r.json()["response"]
                data = json.loads(raw)
                return self._to_receipt(data)
        except (httpx.HTTPError, KeyError, json.JSONDecodeError, AttributeError, TypeError) as e:
            raise ReaderError(str(e)) from e

    def _to_receipt(self, d: dict) -> ReceiptData:
        if not isinstance(d, dict):
            raise ReaderError(f"expected a JSON object, got {type(d).__name__}")
        items = []
        for it in d.get("items") or []:
            if not isinstance(it, dict):
                raise ReaderError(f"expected item to be a JSON object, got {type(it).__name__}")
            tp = normalize_number(it.get("total_price"))
            if tp is None:
                continue
            items.append(ItemData(
                raw_name=str(it.get("name") or "").strip() or "?",
                quantity=normalize_number(it.get("quantity")),
                unit_price=normalize_number(it.get("unit_price")),
                total_price=tp,
                is_discount=tp < 0,
            ))
        return ReceiptData(
            store=d.get("store"), address=d.get("address"), city=d.get("city"),
            country=d.get("country"), date_text=d.get("date"), currency=d.get("currency"),
            subtotal=normalize_number(d.get("subtotal")),
            tax_amount=normalize_number(d.get("tax_amount")),
            total=normalize_number(d.get("total")),
            items=items,
        )
