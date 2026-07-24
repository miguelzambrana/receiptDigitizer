from datetime import datetime, timedelta, timezone
from jose import jwt, JWTError
from passlib.context import CryptContext
from app.config import settings

_pwd = CryptContext(schemes=["bcrypt"], deprecated="auto")

def hash_password(p: str) -> str: return _pwd.hash(p)
def verify_password(p: str, h: str) -> bool: return _pwd.verify(p, h)

def create_token(user_id: int) -> str:
    payload = {"sub": str(user_id), "exp": datetime.now(timezone.utc) + timedelta(days=7)}
    return jwt.encode(payload, settings.jwt_secret, algorithm="HS256")

def decode_token(token: str) -> int | None:
    try:
        return int(jwt.decode(token, settings.jwt_secret, algorithms=["HS256"])["sub"])
    except (JWTError, KeyError, ValueError):
        return None
