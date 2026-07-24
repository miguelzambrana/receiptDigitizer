from fastapi import Depends, HTTPException
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from sqlalchemy.orm import Session
from app.db import get_db
from app.models import User
from app.security import decode_token

_bearer = HTTPBearer(auto_error=False)

def get_current_user(cred: HTTPAuthorizationCredentials = Depends(_bearer),
                     db: Session = Depends(get_db)) -> User:
    if cred is None:
        raise HTTPException(401, "not authenticated")
    uid = decode_token(cred.credentials)
    if uid is None:
        raise HTTPException(401, "invalid token")
    user = db.get(User, uid)
    if user is None:
        raise HTTPException(401, "unknown user")
    return user
