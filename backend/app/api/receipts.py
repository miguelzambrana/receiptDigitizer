from fastapi import APIRouter, UploadFile, File, Depends, BackgroundTasks, HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session
from app.db import get_db, SessionLocal
from app.deps import get_current_user
from app.models import User, Receipt
from app.schemas import ReceiptData
from app.storage import save_image
from app.services.extraction import run_extraction
from app.services.persistence import confirm_receipt

router = APIRouter(prefix="/receipts", tags=["receipts"])

def _mark_failed(receipt_id: int, error: Exception) -> None:
    # Opens its own session: the session used for run_extraction may be in an
    # unknown state after an unexpected exception, so start fresh here.
    db = SessionLocal()
    try:
        r = db.get(Receipt, receipt_id)
        if r is not None:
            r.status = "failed"
            r.raw_extraction = {"error": str(error)}
            db.commit()
    finally:
        db.close()

def _extract_job(receipt_id: int):
    db = SessionLocal()
    try:
        run_extraction(db, receipt_id)
    except Exception as e:
        # run_extraction only handles ReaderError internally. Any other unexpected
        # exception (e.g. a corrupt image blowing up preprocessing) must still leave
        # the receipt in a terminal state, never stuck in "processing" forever.
        _mark_failed(receipt_id, e)
    finally:
        db.close()

@router.post("", status_code=202)
def upload(background: BackgroundTasks, file: UploadFile = File(...),
           db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    path = save_image(file.file.read())
    receipt = Receipt(user_id=user.id, image_path=path, status="processing")
    db.add(receipt); db.commit(); db.refresh(receipt)
    background.add_task(_extract_job, receipt.id)
    return {"id": receipt.id, "status": receipt.status}

@router.get("/{receipt_id}")
def get_one(receipt_id: int, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    r = db.get(Receipt, receipt_id)
    if r is None or r.user_id != user.id:
        raise HTTPException(404)
    return {"id": r.id, "status": r.status, "source_engine": r.source_engine,
            "raw_extraction": r.raw_extraction, "store_id": r.store_id,
            "total": float(r.total) if r.total is not None else None, "currency": r.currency}

@router.put("/{receipt_id}")
def confirm(receipt_id: int, data: ReceiptData, db: Session = Depends(get_db),
            user: User = Depends(get_current_user)):
    r = db.get(Receipt, receipt_id)
    if r is None or r.user_id != user.id:
        raise HTTPException(404)
    confirm_receipt(db, receipt_id, data); db.commit()
    return {"id": r.id, "status": "confirmed", "store_id": r.store_id}

@router.get("")
def list_receipts(db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    rows = db.execute(select(Receipt).where(Receipt.user_id == user.id)
                      .order_by(Receipt.created_at.desc())).scalars().all()
    return [{"id": r.id, "status": r.status, "store_id": r.store_id,
             "total": float(r.total) if r.total is not None else None,
             "currency": r.currency,
             "purchased_at": r.purchased_at.isoformat() if r.purchased_at else None} for r in rows]
