from fastapi import APIRouter, Depends
from sqlalchemy import select, func
from sqlalchemy.orm import Session
from app.db import get_db
from app.deps import get_current_user
from app.models import User, Product, PriceObservation

router = APIRouter(prefix="/products", tags=["products"])

@router.get("")
def list_products(db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    rows = db.execute(
        select(Product.id, Product.display_name, func.count(PriceObservation.id),
               func.max(PriceObservation.currency))
        .join(PriceObservation, PriceObservation.product_id == Product.id)
        .where(PriceObservation.user_id == user.id)
        .group_by(Product.id, Product.display_name)
    ).all()
    result = []
    for pid, name, count, currency in rows:
        last = db.execute(select(PriceObservation.price)
            .where(PriceObservation.product_id == pid, PriceObservation.user_id == user.id)
            .order_by(PriceObservation.observed_at.desc().nullslast(),
                      PriceObservation.created_at.desc()).limit(1)).scalar()
        result.append({"id": pid, "display_name": name,
                       "last_price": float(last) if last is not None else None,
                       "currency": currency, "observations": count})
    return result

@router.get("/{product_id}/prices")
def product_prices(product_id: int, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    rows = db.execute(select(PriceObservation)
        .where(PriceObservation.product_id == product_id, PriceObservation.user_id == user.id)
        .order_by(PriceObservation.observed_at.desc().nullslast(),
                  PriceObservation.created_at.desc())).scalars().all()
    return [{"store_id": o.store_id, "price": float(o.price), "currency": o.currency,
             "observed_at": o.observed_at.isoformat() if o.observed_at else None} for o in rows]
