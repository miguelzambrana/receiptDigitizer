# tests/test_db.py
from sqlalchemy import text
from app.db import engine

def test_db_connects():
    with engine.connect() as conn:
        assert conn.execute(text("SELECT 1")).scalar() == 1
