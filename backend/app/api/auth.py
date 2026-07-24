from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, EmailStr
from sqlalchemy import select
from sqlalchemy.orm import Session
from app.db import get_db
from app.models import User
from app.security import hash_password, verify_password, create_token

router = APIRouter(prefix="/auth", tags=["auth"])

# Used to keep bcrypt cost comparable when the user doesn't exist (or has no
# password_hash), so login timing doesn't leak which emails are registered.
_DUMMY_HASH = hash_password("invalid")

class Creds(BaseModel):
    email: EmailStr
    password: str

@router.post("/register")
def register(c: Creds, db: Session = Depends(get_db)):
    email = c.email.lower()
    if db.execute(select(User).where(User.email == email)).scalar_one_or_none():
        raise HTTPException(400, "email exists")
    u = User(email=email, password_hash=hash_password(c.password))
    db.add(u); db.commit(); db.refresh(u)
    return {"access_token": create_token(u.id), "token_type": "bearer"}

@router.post("/login")
def login(c: Creds, db: Session = Depends(get_db)):
    email = c.email.lower()
    u = db.execute(select(User).where(User.email == email)).scalar_one_or_none()
    if not u or not u.password_hash:
        verify_password(c.password, _DUMMY_HASH)
        raise HTTPException(401, "bad credentials")
    if not verify_password(c.password, u.password_hash):
        raise HTTPException(401, "bad credentials")
    return {"access_token": create_token(u.id), "token_type": "bearer"}
