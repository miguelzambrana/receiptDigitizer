from pydantic import BaseModel

class ItemData(BaseModel):
    raw_name: str
    quantity: float | None = None
    unit_price: float | None = None
    total_price: float
    is_discount: bool = False
    tax_class: str | None = None

class ReceiptData(BaseModel):
    store: str | None = None
    address: str | None = None
    city: str | None = None
    country: str | None = None
    tax_id: str | None = None
    date_text: str | None = None
    currency: str | None = None
    subtotal: float | None = None
    tax_amount: float | None = None
    total: float | None = None
    items: list[ItemData] = []
