import re
from sqlalchemy import select
from sqlalchemy.orm import Session
from app.models import Product

def normalize_name(raw: str) -> str:
    s = re.sub(r"[^\w\s]", "", raw, flags=re.UNICODE)
    return re.sub(r"\s+", " ", s).strip().upper()

def find_or_create_product(db: Session, raw_name: str) -> Product:
    norm = normalize_name(raw_name)
    existing = db.execute(select(Product).where(Product.normalized_name == norm)).scalar_one_or_none()
    if existing:
        return existing
    p = Product(normalized_name=norm, display_name=raw_name.strip())
    db.add(p)
    db.flush()
    return p
