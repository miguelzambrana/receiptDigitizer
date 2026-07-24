from fastapi import Depends
from sqlalchemy import select
from sqlalchemy.orm import Session
from app.db import get_db
from app.models import User

def get_current_user(db: Session = Depends(get_db)) -> User:
    user = db.execute(select(User).where(User.email == "dev@local")).scalar_one_or_none()
    if user is None:
        user = User(email="dev@local"); db.add(user); db.commit(); db.refresh(user)
    return user
